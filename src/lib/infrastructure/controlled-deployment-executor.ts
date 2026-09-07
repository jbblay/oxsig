import { stringifyPostgresJson } from '@/lib/db/postgres-safe';
import 'server-only';

import { captureProductEvent } from '@/lib/analytics/posthog';
import { AUDIT_ACTIONS, logAudit, type AuditLogEntry } from '@/lib/audit/logger';
import { getPool, transaction } from '@/lib/db/pool';
import { createLabVm, destroyLabVm, labCapabilities } from '@/lib/labs/aws-runtime';
import { LAB_CATALOG } from '@/lib/labs/catalog';
import type { LabDefinition } from '@/lib/labs/types';
import type { DeploymentAuthorizationRecord } from './deployment-authorization';

const configuredTtl = Number.parseInt(process.env.LAB_AWS_TTL_MINUTES || '60', 10);
const LAB_TTL_MINUTES = Number.isFinite(configuredTtl) ? Math.min(120, Math.max(15, configuredTtl)) : 60;
const ONE_LAB_INDEX = 'idx_lab_instances_one_nonterminal_per_owner';

export type ControlledDeploymentExecutionResult = {
  instance: {
    id: string;
    slug: string;
    name: string;
    status: string;
    lastError: string | null;
    createdAt: string;
    startedAt: string | null;
    expiresAt: string;
    metadata: Record<string, unknown>;
  };
  executionId: string;
  authorizationId: string;
  alreadyStarted: boolean;
};

export class ControlledDeploymentExecutionError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code: string,
    readonly instanceId?: string
  ) {
    super(message);
    this.name = 'ControlledDeploymentExecutionError';
  }
}

function mapInstance(row: Record<string, any>, lab: LabDefinition) {
  return {
    id: String(row.id),
    slug: lab.slug,
    name: lab.name,
    status: String(row.status),
    lastError: row.last_error ? String(row.last_error) : null,
    createdAt: new Date(row.created_at).toISOString(),
    startedAt: row.started_at ? new Date(row.started_at).toISOString() : null,
    expiresAt: new Date(row.expires_at).toISOString(),
    metadata: (row.metadata || {}) as Record<string, unknown>,
  };
}

function resolveControlledLab(authorization: DeploymentAuthorizationRecord) {
  const support = authorization.executionSupport;
  if (!support.supported || support.adapter !== 'existing-lab-vm' || !support.target) {
    throw new ControlledDeploymentExecutionError(
      support.reasons[0] || 'This deployment plan is not supported by the current controlled runtime adapter.',
      409,
      'EXECUTION_ADAPTER_UNSUPPORTED'
    );
  }

  const lab = LAB_CATALOG.find((candidate) => candidate.slug === support.target?.labSlug && candidate.runtime === 'vm');
  if (!lab) {
    throw new ControlledDeploymentExecutionError(
      'The runtime profile no longer maps to a recognized Cyber Lab definition.',
      409,
      'RUNTIME_MAPPING_CHANGED'
    );
  }
  if (!lab.available) {
    throw new ControlledDeploymentExecutionError(
      lab.availabilityNote || `${lab.name} is not enabled for this deployment.`,
      409,
      lab.marketplaceProductCode ? 'MARKETPLACE_ACTIVATION_REQUIRED' : 'LAB_UNAVAILABLE'
    );
  }
  if (!lab.accessModes.includes(support.target.accessMode)) {
    throw new ControlledDeploymentExecutionError(
      `${lab.shortName} no longer supports ${support.target.accessMode} access.`,
      409,
      'RUNTIME_MAPPING_CHANGED'
    );
  }
  if (support.target.accessMode === 'desktop' && !lab.desktopInstanceType) {
    throw new ControlledDeploymentExecutionError(
      `${lab.shortName} desktop access is not configured on this deployment.`,
      409,
      'DESKTOP_PROFILE_UNAVAILABLE'
    );
  }

  const provisionLab = support.target.accessMode === 'desktop'
    ? { ...lab, recommendedInstanceType: lab.desktopInstanceType! }
    : lab;

  return { lab, provisionLab, target: support.target };
}

async function loadBoundInstance(ownerId: string, instanceId: string) {
  const result = await getPool().query(
    `SELECT instance.*
       FROM lab_instances instance
      WHERE instance.id=$1 AND instance.owner_id=$2
      LIMIT 1`,
    [instanceId, ownerId]
  );
  return result.rows[0] || null;
}

export async function executeControlledDeployment(input: {
  ownerId: string;
  distinctId: string;
  authorization: DeploymentAuthorizationRecord;
  executionId: string;
  auditRequestMetadata?: Pick<AuditLogEntry, 'ipAddress' | 'userAgent'>;
}): Promise<ControlledDeploymentExecutionResult> {
  const { authorization } = input;
  if (!authorization.executionId || authorization.executionId !== input.executionId) {
    throw new ControlledDeploymentExecutionError(
      'The execution receipt does not match this deployment authorization.',
      409,
      'EXECUTION_RECEIPT_MISMATCH'
    );
  }

  if (authorization.state === 'executing' && authorization.labInstanceId) {
    const { lab } = resolveControlledLab(authorization);
    const existing = await loadBoundInstance(input.ownerId, authorization.labInstanceId);
    if (!existing) {
      throw new ControlledDeploymentExecutionError(
        'The deployment execution is bound to a missing lab allocation.',
        409,
        'BOUND_LAB_MISSING'
      );
    }
    return {
      instance: mapInstance(existing, lab),
      executionId: input.executionId,
      authorizationId: authorization.id,
      alreadyStarted: true,
    };
  }

  if (authorization.state !== 'receipt_issued') {
    throw new ControlledDeploymentExecutionError(
      authorization.state === 'expired'
        ? 'The execution receipt expired. Generate and authorize the plan again.'
        : 'This execution receipt is no longer available to start a deployment.',
      409,
      'EXECUTION_RECEIPT_NOT_ACTIVE'
    );
  }

  const { lab, provisionLab, target } = resolveControlledLab(authorization);
  const capabilities = await labCapabilities();
  if (!capabilities.configured) {
    throw new ControlledDeploymentExecutionError(
      capabilities.reason || 'AWS lab runtime is unavailable.',
      503,
      'LAB_RUNTIME_UNAVAILABLE'
    );
  }

  let prepared: { instanceId: string; expiresAt: string; row: Record<string, any> };
  try {
    prepared = await transaction(async (client) => {
      const owner = await client.query(`SELECT id FROM users WHERE id=$1 FOR UPDATE`, [input.ownerId]);
      if (!owner.rows[0]) {
        throw new ControlledDeploymentExecutionError('Deployment owner does not exist.', 404, 'OWNER_NOT_FOUND');
      }

      const locked = await client.query(
        `SELECT id, owner_id, state, execution_id, expires_at, execution_support, lab_instance_id
           FROM deployment_authorizations
          WHERE id=$1 AND owner_id=$2
          FOR UPDATE`,
        [authorization.id, input.ownerId]
      );
      const row = locked.rows[0];
      if (!row) {
        throw new ControlledDeploymentExecutionError('Deployment authorization was not found.', 404, 'AUTHORIZATION_NOT_FOUND');
      }
      if (String(row.execution_id || '') !== input.executionId) {
        throw new ControlledDeploymentExecutionError('Execution receipt mismatch.', 409, 'EXECUTION_RECEIPT_MISMATCH');
      }

      if (row.state === 'executing' && row.lab_instance_id) {
        const existing = await client.query(
          `SELECT * FROM lab_instances WHERE id=$1 AND owner_id=$2 LIMIT 1`,
          [row.lab_instance_id, input.ownerId]
        );
        if (!existing.rows[0]) {
          throw new ControlledDeploymentExecutionError('The bound lab allocation is missing.', 409, 'BOUND_LAB_MISSING');
        }
        return {
          instanceId: String(row.lab_instance_id),
          expiresAt: new Date(existing.rows[0].expires_at).toISOString(),
          row: existing.rows[0],
          alreadyPrepared: true,
        } as any;
      }

      if (row.state !== 'receipt_issued') {
        throw new ControlledDeploymentExecutionError('Execution receipt has already been consumed.', 409, 'EXECUTION_RECEIPT_NOT_ACTIVE');
      }
      if (new Date(row.expires_at).getTime() <= Date.now()) {
        await client.query(
          `UPDATE deployment_authorizations SET state='expired', updated_at=NOW() WHERE id=$1`,
          [authorization.id]
        );
        throw new ControlledDeploymentExecutionError('Execution receipt has expired.', 409, 'EXECUTION_RECEIPT_EXPIRED');
      }

      const currentSupport = row.execution_support as Record<string, any>;
      if (
        currentSupport?.supported !== true ||
        currentSupport?.adapter !== 'existing-lab-vm' ||
        currentSupport?.target?.labSlug !== target.labSlug ||
        currentSupport?.target?.nodeId !== target.nodeId ||
        currentSupport?.target?.accessMode !== target.accessMode
      ) {
        throw new ControlledDeploymentExecutionError(
          'The persisted execution adapter contract no longer matches the reviewed receipt.',
          409,
          'EXECUTION_CONTRACT_MISMATCH'
        );
      }

      const active = await client.query(
        `SELECT COUNT(*)::int AS count
           FROM lab_instances
          WHERE owner_id=$1
            AND status NOT IN ('destroying','destroyed','failed')
            AND (expires_at IS NULL OR expires_at > NOW())`,
        [input.ownerId]
      );
      if ((active.rows[0]?.count || 0) >= 1) {
        throw new ControlledDeploymentExecutionError(
          'One active cloud lab is allowed per account at a time. Destroy the current lab before starting this deployment.',
          409,
          'ACTIVE_LAB_EXISTS'
        );
      }

      const definition = await client.query(
        `INSERT INTO lab_definitions (slug, name, category, description, difficulty, runtime_kind, definition, enabled)
         VALUES ($1,$2,$3,$4,$5,$6,$7,true)
         ON CONFLICT (slug) DO UPDATE
           SET name=EXCLUDED.name,
               category=EXCLUDED.category,
               description=EXCLUDED.description,
               difficulty=EXCLUDED.difficulty,
               runtime_kind=EXCLUDED.runtime_kind,
               definition=EXCLUDED.definition,
               enabled=true,
               updated_at=NOW()
         RETURNING id`,
        [
          lab.slug,
          lab.name,
          lab.category,
          lab.description,
          lab.difficulty,
          lab.runtime,
          stringifyPostgresJson({
            objectives: lab.objectives,
            osFamily: lab.osFamily,
            platform: lab.platform,
            shell: lab.shell,
            accessModes: lab.accessModes,
            defaultAccessMode: lab.defaultAccessMode,
            recommendedInstanceType: lab.recommendedInstanceType,
            desktopInstanceType: lab.desktopInstanceType,
          }),
        ]
      );

      const created = await client.query(
        `INSERT INTO lab_instances (definition_id, owner_id, status, runtime_provider, expires_at, metadata)
         VALUES ($1,$2,'provisioning','aws-ec2',NOW() + ($3 * INTERVAL '1 minute'),$4::jsonb)
         RETURNING *`,
        [
          definition.rows[0].id,
          input.ownerId,
          LAB_TTL_MINUTES,
          stringifyPostgresJson({
            source: 'infrastructure-designer',
            authorizationId: authorization.id,
            executionId: input.executionId,
            planId: authorization.planId,
            planHash: authorization.planHash,
            nodeId: target.nodeId,
            accessMode: target.accessMode,
          }),
        ]
      );
      const instanceId = String(created.rows[0].id);

      const transitioned = await client.query(
        `UPDATE deployment_authorizations
            SET state='executing',
                lab_instance_id=$1,
                execution_started_at=NOW(),
                updated_at=NOW()
          WHERE id=$2
            AND owner_id=$3
            AND state='receipt_issued'
            AND execution_id=$4
          RETURNING id`,
        [instanceId, authorization.id, input.ownerId, input.executionId]
      );
      if (!transitioned.rows[0]) {
        throw new ControlledDeploymentExecutionError(
          'The execution receipt was consumed by another request.',
          409,
          'EXECUTION_RECEIPT_CONSUMED'
        );
      }

      return {
        instanceId,
        expiresAt: new Date(created.rows[0].expires_at).toISOString(),
        row: created.rows[0],
      };
    });
  } catch (error: any) {
    if (error instanceof ControlledDeploymentExecutionError) throw error;
    if (error?.code === '23505' && error?.constraint === ONE_LAB_INDEX) {
      throw new ControlledDeploymentExecutionError(
        'A cloud lab allocation already exists for this account. Wait for cleanup or destroy it before starting another.',
        409,
        'ACTIVE_LAB_EXISTS'
      );
    }
    throw error;
  }

  if ((prepared as any).alreadyPrepared) {
    return {
      instance: mapInstance(prepared.row, lab),
      executionId: input.executionId,
      authorizationId: authorization.id,
      alreadyStarted: true,
    };
  }

  let externalId: string | undefined;
  try {
    const provisioned = await createLabVm(prepared.instanceId, input.ownerId, prepared.expiresAt, provisionLab);
    externalId = provisioned.externalId;

    const result = await getPool().query(
      `UPDATE lab_instances
          SET runtime_external_id=$1,
              metadata=COALESCE(metadata,'{}'::jsonb) || $2::jsonb,
              last_error=NULL,
              updated_at=NOW()
        WHERE id=$3 AND owner_id=$4
        RETURNING *`,
      [
        provisioned.externalId,
        stringifyPostgresJson({
          region: provisioned.region,
          imageId: provisioned.imageId,
          instanceType: provisioned.instanceType,
          osFamily: provisioned.osFamily,
          platform: provisioned.platform,
          shell: lab.shell,
          accessMode: target.accessMode,
        }),
        prepared.instanceId,
        input.ownerId,
      ]
    );

    await getPool().query(
      `INSERT INTO lab_events (lab_instance_id,event_type,payload)
       VALUES ($1,'deployment_execution_started',$2)`,
      [
        prepared.instanceId,
        stringifyPostgresJson({
          authorizationId: authorization.id,
          executionId: input.executionId,
          planId: authorization.planId,
          planHash: authorization.planHash,
          provider: 'aws-ec2',
          externalId: provisioned.externalId,
          nodeId: target.nodeId,
          labSlug: lab.slug,
          accessMode: target.accessMode,
        }),
      ]
    );

    await logAudit({
      userId: input.ownerId,
      action: AUDIT_ACTIONS.DEPLOYMENT_EXECUTE,
      resourceType: 'lab',
      resourceId: prepared.instanceId,
      ...input.auditRequestMetadata,
      metadata: {
        authorizationId: authorization.id,
        executionId: input.executionId,
        planId: authorization.planId,
        planHash: authorization.planHash,
        definition: lab.slug,
        nodeId: target.nodeId,
        provider: 'aws-ec2',
        accessMode: target.accessMode,
      },
    });

    await captureProductEvent({
      distinctId: input.distinctId,
      event: 'infrastructure_deployment_started',
      properties: {
        lab_slug: lab.slug,
        os_family: lab.osFamily,
        platform: lab.platform,
        access_mode: target.accessMode,
        ttl_minutes: LAB_TTL_MINUTES,
        plan_id: authorization.planId,
      },
    });

    if (!result.rows[0]) {
      throw new Error('Provisioned lab allocation could not be reloaded.');
    }

    return {
      instance: mapInstance(result.rows[0], lab),
      executionId: input.executionId,
      authorizationId: authorization.id,
      alreadyStarted: false,
    };
  } catch (error) {
    if (externalId) {
      try {
        await destroyLabVm(externalId);
      } catch {
        // The VM remains tagged for scheduled administrative cleanup if cleanup itself fails.
      }
    }

    const message = error instanceof Error ? error.message.slice(0, 500) : 'Controlled deployment failed';
    await transaction(async (client) => {
      await client.query(
        `UPDATE lab_instances
            SET status='failed', last_error=$1, updated_at=NOW()
          WHERE id=$2 AND owner_id=$3`,
        [message, prepared.instanceId, input.ownerId]
      );
      await client.query(
        `UPDATE deployment_authorizations
            SET state='failed', failure_reason=$1, updated_at=NOW()
          WHERE id=$2 AND owner_id=$3 AND execution_id=$4`,
        [message, authorization.id, input.ownerId, input.executionId]
      );
    });

    await logAudit({
      userId: input.ownerId,
      action: AUDIT_ACTIONS.DEPLOYMENT_EXECUTE_FAILED,
      resourceType: 'lab',
      resourceId: prepared.instanceId,
      ...input.auditRequestMetadata,
      metadata: {
        authorizationId: authorization.id,
        executionId: input.executionId,
        planId: authorization.planId,
        planHash: authorization.planHash,
        definition: lab.slug,
        error: message,
      },
    });

    throw new ControlledDeploymentExecutionError(
      message,
      500,
      'DEPLOYMENT_EXECUTION_FAILED',
      prepared.instanceId
    );
  }
}
