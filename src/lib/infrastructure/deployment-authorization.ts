import 'server-only';

import { z } from 'zod';
import { transaction } from '@/lib/db/pool';
import { deploymentPlanSchema, type DeploymentPlan } from './deployment-plan-schema';
import type { DeploymentExecutionSupport } from './deployment-execution-support';

export const DEPLOYMENT_AUTHORIZATION_TTL_MINUTES = 15;

export const DEPLOYMENT_AUTHORIZATION_STATES = [
  'authorized',
  'executing',
  'evidence_recorded',
  'analyzed',
  'cancelled',
  'expired',
  'failed',
] as const;

export type DeploymentAuthorizationState = (typeof DEPLOYMENT_AUTHORIZATION_STATES)[number];

const executionSupportSchema = z.object({
  supported: z.boolean(),
  adapter: z.enum(['existing-lab-vm', 'none']),
  reasons: z.array(z.string()),
  target: z.object({
    nodeId: z.string(),
    labSlug: z.string(),
    accessMode: z.enum(['terminal', 'desktop']),
  }).optional(),
}).strict();

export type DeploymentAuthorizationRecord = {
  id: string;
  ownerId: string;
  planId: string;
  planHash: string;
  planSnapshot: DeploymentPlan;
  sourceDesignUpdatedAt: string;
  executionSupport: DeploymentExecutionSupport;
  state: DeploymentAuthorizationState;
  executionId?: string;
  labInstanceId?: string;
  executionStartedAt?: string;
  evidenceRecordedAt?: string;
  analyzedAt?: string;
  failureReason?: string;
  expiresAt: string;
  createdAt: string;
  updatedAt: string;
};

export type DeploymentExecutionReceipt = {
  executionId: string;
  authorizationId: string;
  planId: string;
  planHash: string;
  adapter: 'existing-lab-vm';
  target: {
    nodeId: string;
    labSlug: string;
    accessMode: 'terminal' | 'desktop';
  };
  issuedAt: string;
};

function iso(value: unknown) {
  return new Date(String(value)).toISOString();
}

function mapRow(row: Record<string, unknown>): DeploymentAuthorizationRecord {
  return {
    id: String(row.id),
    ownerId: String(row.owner_id),
    planId: String(row.plan_id),
    planHash: String(row.plan_hash),
    planSnapshot: deploymentPlanSchema.parse(row.plan_snapshot),
    sourceDesignUpdatedAt: iso(row.source_design_updated_at),
    executionSupport: executionSupportSchema.parse(row.execution_support),
    state: z.enum(DEPLOYMENT_AUTHORIZATION_STATES).parse(row.state),
    ...(row.execution_id ? { executionId: String(row.execution_id) } : {}),
    ...(row.lab_instance_id ? { labInstanceId: String(row.lab_instance_id) } : {}),
    ...(row.execution_started_at ? { executionStartedAt: iso(row.execution_started_at) } : {}),
    ...(row.evidence_recorded_at ? { evidenceRecordedAt: iso(row.evidence_recorded_at) } : {}),
    ...(row.analyzed_at ? { analyzedAt: iso(row.analyzed_at) } : {}),
    ...(row.failure_reason ? { failureReason: String(row.failure_reason) } : {}),
    expiresAt: iso(row.expires_at),
    createdAt: iso(row.created_at),
    updatedAt: iso(row.updated_at),
  };
}

export class DeploymentAuthorizationConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'DeploymentAuthorizationConflictError';
  }
}

export async function createDeploymentAuthorization(input: {
  ownerId: string;
  planId: string;
  planHash: string;
  plan: DeploymentPlan;
  sourceDesignUpdatedAt: string;
  executionSupport: DeploymentExecutionSupport;
}): Promise<DeploymentAuthorizationRecord> {
  return transaction(async (client) => {
    const owner = await client.query(`SELECT id FROM users WHERE id=$1 FOR UPDATE`, [input.ownerId]);
    if (!owner.rows[0]) throw new Error('Authorization owner does not exist.');

    await client.query(
      `UPDATE deployment_authorizations
          SET state='expired', updated_at=NOW()
        WHERE owner_id=$1
          AND state='authorized'
          AND expires_at <= NOW()`,
      [input.ownerId]
    );

    const executing = await client.query(
      `SELECT id
         FROM deployment_authorizations
        WHERE owner_id=$1 AND state='executing'
        LIMIT 1`,
      [input.ownerId]
    );
    if (executing.rows[0]) {
      throw new DeploymentAuthorizationConflictError('A deployment execution is already in progress for this account.');
    }

    await client.query(
      `UPDATE deployment_authorizations
          SET state='cancelled', updated_at=NOW()
        WHERE owner_id=$1 AND state='authorized'`,
      [input.ownerId]
    );

    const result = await client.query(
      `INSERT INTO deployment_authorizations (
         owner_id, plan_id, plan_hash, plan_snapshot, source_design_updated_at,
         execution_support, state, expires_at
       ) VALUES (
         $1,$2,$3,$4::jsonb,$5,$6::jsonb,'authorized',
         NOW() + ($7 * INTERVAL '1 minute')
       )
       RETURNING *`,
      [
        input.ownerId,
        input.planId,
        input.planHash,
        JSON.stringify(deploymentPlanSchema.parse(input.plan)),
        input.sourceDesignUpdatedAt,
        JSON.stringify(executionSupportSchema.parse(input.executionSupport)),
        DEPLOYMENT_AUTHORIZATION_TTL_MINUTES,
      ]
    );

    return mapRow(result.rows[0]);
  });
}

export async function getDeploymentAuthorizationForPlan(
  ownerId: string,
  planHash: string
): Promise<DeploymentAuthorizationRecord | null> {
  return transaction(async (client) => {
    await client.query(
      `UPDATE deployment_authorizations
          SET state='expired', updated_at=NOW()
        WHERE owner_id=$1
          AND state='authorized'
          AND expires_at <= NOW()`,
      [ownerId]
    );

    const result = await client.query(
      `SELECT *
         FROM deployment_authorizations
        WHERE owner_id=$1 AND plan_hash=$2
        ORDER BY created_at DESC
        LIMIT 1`,
      [ownerId, planHash]
    );

    return result.rows[0] ? mapRow(result.rows[0]) : null;
  });
}

export async function getDeploymentAuthorizationById(
  ownerId: string,
  authorizationId: string
): Promise<DeploymentAuthorizationRecord | null> {
  return transaction(async (client) => {
    await client.query(
      `UPDATE deployment_authorizations
          SET state='expired', updated_at=NOW()
        WHERE id=$1 AND owner_id=$2 AND state='authorized' AND expires_at <= NOW()`,
      [authorizationId, ownerId]
    );

    const result = await client.query(
      `SELECT * FROM deployment_authorizations WHERE id=$1 AND owner_id=$2 LIMIT 1`,
      [authorizationId, ownerId]
    );
    return result.rows[0] ? mapRow(result.rows[0]) : null;
  });
}

export async function claimDeploymentExecutionReceipt(
  ownerId: string,
  authorizationId: string
): Promise<DeploymentExecutionReceipt> {
  return transaction(async (client) => {
    await client.query(
      `UPDATE deployment_authorizations
          SET state='expired', updated_at=NOW()
        WHERE id=$1 AND owner_id=$2 AND state='authorized' AND expires_at <= NOW()`,
      [authorizationId, ownerId]
    );

    const locked = await client.query(
      `SELECT *
         FROM deployment_authorizations
        WHERE id=$1 AND owner_id=$2
        FOR UPDATE`,
      [authorizationId, ownerId]
    );
    if (!locked.rows[0]) {
      throw new DeploymentAuthorizationConflictError('Deployment authorization was not found.');
    }

    const authorization = mapRow(locked.rows[0]);
    if (authorization.state !== 'authorized') {
      throw new DeploymentAuthorizationConflictError(
        authorization.state === 'expired'
          ? 'Deployment authorization has expired. Generate and authorize the plan again.'
          : 'Deployment authorization has already been consumed or is no longer active.'
      );
    }

    if (
      !authorization.executionSupport.supported ||
      authorization.executionSupport.adapter !== 'existing-lab-vm' ||
      !authorization.executionSupport.target
    ) {
      throw new DeploymentAuthorizationConflictError(
        authorization.executionSupport.reasons[0] || 'The current runtime cannot execute this authorized plan yet.'
      );
    }

    const updated = await client.query(
      `UPDATE deployment_authorizations
          SET state='executing',
              execution_id=gen_random_uuid(),
              execution_started_at=NOW(),
              updated_at=NOW()
        WHERE id=$1 AND owner_id=$2 AND state='authorized'
        RETURNING *`,
      [authorizationId, ownerId]
    );
    if (!updated.rows[0]) {
      throw new DeploymentAuthorizationConflictError('Deployment authorization was consumed by another request.');
    }

    const claimed = mapRow(updated.rows[0]);
    if (!claimed.executionId || !claimed.executionStartedAt || !claimed.executionSupport.target) {
      throw new Error('Deployment execution receipt could not be created.');
    }

    return {
      executionId: claimed.executionId,
      authorizationId: claimed.id,
      planId: claimed.planId,
      planHash: claimed.planHash,
      adapter: 'existing-lab-vm',
      target: claimed.executionSupport.target,
      issuedAt: claimed.executionStartedAt,
    };
  });
}
