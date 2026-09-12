import 'server-only';

import { DescribeInstancesCommand, EC2Client, StartInstancesCommand } from '@aws-sdk/client-ec2';
import type { Pool, PoolClient } from 'pg';
import { awsClientConfig } from '@/lib/aws/client-config';
import { stringifyPostgresJson } from '@/lib/db/postgres-safe';
import { getOperation, type OperationMode } from '@/lib/operations/catalog';
import { sealOperationAccessSecret } from '@/lib/operations/access-secret';
import { OperationRuntimeError } from '@/lib/operations/runtime';

const REGION = process.env.LAB_AWS_REGION || process.env.AWS_REGION || 'eu-central-1';
const SLOT_KEY = process.env.LAB_AWS_BLACK_DOMAIN_SLOT_KEY || 'black-domain-slot-01';
const DC_INSTANCE_ID = process.env.LAB_AWS_BLACK_DOMAIN_DC_INSTANCE_ID;
const WORKSTATION_INSTANCE_ID = process.env.LAB_AWS_BLACK_DOMAIN_WORKSTATION_INSTANCE_ID;
const OPERATOR_INSTANCE_ID = process.env.LAB_AWS_BLACK_DOMAIN_OPERATOR_INSTANCE_ID;
const DC_SNAPSHOT_ID = process.env.LAB_AWS_BLACK_DOMAIN_DC_SNAPSHOT_ID || null;
const WORKSTATION_SNAPSHOT_ID = process.env.LAB_AWS_BLACK_DOMAIN_WORKSTATION_SNAPSHOT_ID || null;
const OPERATOR_SNAPSHOT_ID = process.env.LAB_AWS_BLACK_DOMAIN_OPERATOR_SNAPSHOT_ID || null;
const INITIAL_PASSWORD = process.env.LAB_AWS_BLACK_DOMAIN_INITIAL_PASSWORD;
const READINESS_VERSION = 1;
const ONE_LAB_INDEX = 'idx_lab_instances_one_nonterminal_per_owner';
const ec2 = new EC2Client(awsClientConfig(REGION));

type SlotNode = {
  id: string;
  nodeKey: 'dc' | 'workstation' | 'operator';
  label: string;
  role: 'infrastructure' | 'target' | 'operator';
  osFamily: 'windows' | 'ubuntu';
  instanceId: string;
  privateIp: string;
  labInstanceId: string | null;
};

function requireSlotConfig() {
  if (!DC_INSTANCE_ID || !WORKSTATION_INSTANCE_ID || !OPERATOR_INSTANCE_ID || !INITIAL_PASSWORD) {
    throw new OperationRuntimeError(
      'Prepared Black Domain requires all three instance ids and its initial password.',
      503,
      'OPERATION_ENVIRONMENT_CONFIGURATION_INCOMPLETE',
    );
  }
  return {
    dc: DC_INSTANCE_ID,
    workstation: WORKSTATION_INSTANCE_ID,
    operator: OPERATOR_INSTANCE_ID,
    initialPassword: INITIAL_PASSWORD,
  };
}

function expiryMinutes(estimatedMinutes: number) {
  return Math.min(180, Math.max(60, estimatedMinutes + 30));
}

async function inspectConfiguredSlot(instanceIds: string[]) {
  const response = await ec2.send(new DescribeInstancesCommand({ InstanceIds: instanceIds }));
  const instances = (response.Reservations || []).flatMap((reservation) => reservation.Instances || []);
  if (instances.length !== instanceIds.length) {
    throw new OperationRuntimeError('A configured Black Domain slot instance is missing.', 503, 'OPERATION_ENVIRONMENT_MISSING');
  }

  const byId = new Map(instances.filter((instance) => instance.InstanceId).map((instance) => [instance.InstanceId!, instance]));
  return instanceIds.map((instanceId) => {
    const instance = byId.get(instanceId);
    const state = instance?.State?.Name;
    if (!instance?.PrivateIpAddress || !state) {
      throw new OperationRuntimeError('A configured Black Domain slot has incomplete EC2 state.', 503, 'OPERATION_ENVIRONMENT_INVALID');
    }
    if (state !== 'stopped') {
      throw new OperationRuntimeError('Black Domain Slot 01 is not available yet.', 409, 'OPERATION_ENVIRONMENT_BUSY');
    }
    const tags = new Map((instance.Tags || []).filter((tag) => tag.Key && tag.Value).map((tag) => [tag.Key!, tag.Value!]));
    if (tags.get('EnvironmentSlot') !== SLOT_KEY || tags.get('Lifecycle') !== 'Reusable') {
      throw new OperationRuntimeError('Configured Black Domain compute is not tagged as a reusable slot.', 503, 'OPERATION_ENVIRONMENT_INVALID');
    }
    return { instanceId, privateIp: instance.PrivateIpAddress };
  });
}

async function ensureEnvironmentRow(client: PoolClient, configured: ReturnType<typeof requireSlotConfig>, inspected: Awaited<ReturnType<typeof inspectConfiguredSlot>>) {
  const [dc, workstation, operator] = inspected;
  const result = await client.query(
    `INSERT INTO operation_environments (
       operation_slug,slot_key,status,
       dc_instance_id,workstation_instance_id,operator_instance_id,
       dc_private_ip,workstation_private_ip,operator_private_ip,
       dc_baseline_snapshot_id,workstation_baseline_snapshot_id,operator_baseline_snapshot_id,
       metadata
     )
     VALUES ('black-domain',$1,'available',$2,$3,$4,$5::inet,$6::inet,$7::inet,$8,$9,$10,$11::jsonb)
     ON CONFLICT (operation_slug,slot_key) DO UPDATE SET
       dc_instance_id=EXCLUDED.dc_instance_id,
       workstation_instance_id=EXCLUDED.workstation_instance_id,
       operator_instance_id=EXCLUDED.operator_instance_id,
       dc_private_ip=EXCLUDED.dc_private_ip,
       workstation_private_ip=EXCLUDED.workstation_private_ip,
       operator_private_ip=EXCLUDED.operator_private_ip,
       dc_baseline_snapshot_id=EXCLUDED.dc_baseline_snapshot_id,
       workstation_baseline_snapshot_id=EXCLUDED.workstation_baseline_snapshot_id,
       operator_baseline_snapshot_id=EXCLUDED.operator_baseline_snapshot_id,
       metadata=operation_environments.metadata || EXCLUDED.metadata,
       updated_at=NOW()
     RETURNING id`,
    [
      SLOT_KEY,
      configured.dc,
      configured.workstation,
      configured.operator,
      dc.privateIp,
      workstation.privateIp,
      operator.privateIp,
      DC_SNAPSHOT_ID,
      WORKSTATION_SNAPSHOT_ID,
      OPERATOR_SNAPSHOT_ID,
      stringifyPostgresJson({ region: REGION, managedBy: 'oxsig', baselineSet: 'black-domain-slot-01-2026-09-12' }),
    ],
  );
  return result.rows[0].id as string;
}

export async function provisionPreparedBlackDomainRun(args: {
  pool: Pool;
  ownerId: string;
  slug: string;
  mode: OperationMode;
}) {
  const operation = getOperation(args.slug);
  if (!operation || operation.slug !== 'black-domain') {
    throw new OperationRuntimeError('Operation not found.', 404, 'OPERATION_NOT_FOUND');
  }

  const configured = requireSlotConfig();
  const inspected = await inspectConfiguredSlot([configured.dc, configured.workstation, configured.operator]);
  const expiresAt = new Date(Date.now() + expiryMinutes(operation.estimatedMinutes) * 60_000).toISOString();
  const client = await args.pool.connect();

  let runId = '';
  let operatorLabInstanceId = '';
  let environmentId = '';
  const nodes: SlotNode[] = [];

  try {
    await client.query('BEGIN');
    const active = await client.query(
      `SELECT 1 FROM lab_instances
        WHERE owner_id=$1 AND status NOT IN ('destroying','destroyed','failed')
          AND (expires_at IS NULL OR expires_at > NOW())
        LIMIT 1`,
      [args.ownerId],
    );
    if (active.rowCount) {
      throw new OperationRuntimeError('Stop or destroy your current Cyber Lab before starting a multi-node Operation.', 409, 'OPERATION_LAB_SLOT_OCCUPIED');
    }

    await ensureEnvironmentRow(client, configured, inspected);
    const environment = await client.query(
      `SELECT id,dc_instance_id,workstation_instance_id,operator_instance_id,
              dc_private_ip::text,workstation_private_ip::text,operator_private_ip::text
         FROM operation_environments
        WHERE operation_slug='black-domain' AND slot_key=$1 AND status='available'
        FOR UPDATE SKIP LOCKED`,
      [SLOT_KEY],
    );
    if (!environment.rowCount) {
      throw new OperationRuntimeError('Black Domain Slot 01 is currently reserved or awaiting reset.', 409, 'OPERATION_ENVIRONMENT_UNAVAILABLE');
    }
    const slot = environment.rows[0];
    environmentId = slot.id;

    const definition = await client.query(
      `INSERT INTO lab_definitions (slug,name,category,description,difficulty,runtime_kind,definition,enabled)
       VALUES ($1,$2,$3,$4,$5,'vm',$6::jsonb,true)
       ON CONFLICT (slug) DO UPDATE SET name=EXCLUDED.name,category=EXCLUDED.category,
         description=EXCLUDED.description,difficulty=EXCLUDED.difficulty,
         definition=EXCLUDED.definition,enabled=true,updated_at=NOW()
       RETURNING id`,
      [
        'operation-black-domain-operator',
        'Black Domain Operator',
        'Active Directory',
        'Managed Ubuntu operator for Operation Black Domain.',
        'advanced',
        stringifyPostgresJson({ operationSlug: operation.slug, role: 'operator', osFamily: 'ubuntu', accessModes: ['terminal'] }),
      ],
    );

    const run = await client.query(
      `INSERT INTO operation_runs (owner_id,operation_slug,mode,status,expires_at,environment_id,metadata)
       VALUES ($1,$2,$3,'provisioning',$4,$5,$6::jsonb)
       RETURNING id`,
      [args.ownerId, operation.slug, args.mode, expiresAt, environmentId, stringifyPostgresJson({
        domain: 'blackdomain.local',
        domainNetbios: 'BLACKDOMAIN',
        initialAccess: { username: 'BLACKDOMAIN\\labuser' },
        readinessVersion: READINESS_VERSION,
        scenario: 'active-directory',
        lifecycle: 'prepared-environment',
        environmentSlot: SLOT_KEY,
      })],
    );
    runId = run.rows[0].id;
    const passwordSecret = sealOperationAccessSecret({ ownerId: args.ownerId, runId, password: configured.initialPassword });
    await client.query(
      `UPDATE operation_runs SET metadata=metadata || $1::jsonb,updated_at=NOW() WHERE id=$2 AND owner_id=$3`,
      [stringifyPostgresJson({ initialAccess: { username: 'BLACKDOMAIN\\labuser', passwordSecret } }), runId, args.ownerId],
    );

    const operatorLab = await client.query(
      `INSERT INTO lab_instances (definition_id,owner_id,status,runtime_provider,runtime_external_id,expires_at,metadata)
       VALUES ($1,$2,'provisioning','aws-ec2',$3,$4,$5::jsonb)
       RETURNING id`,
      [definition.rows[0].id, args.ownerId, slot.operator_instance_id, expiresAt, stringifyPostgresJson({
        accessMode: 'terminal',
        operationRunId: runId,
        operationSlug: operation.slug,
        operationNodeKey: 'operator',
        managedByOperation: true,
        environmentId,
      })],
    );
    operatorLabInstanceId = operatorLab.rows[0].id;

    const nodeRows = await client.query(
      `INSERT INTO operation_nodes
        (run_id,node_key,label,role,os_family,status,runtime_external_id,private_ip,lab_instance_id,metadata)
       VALUES
        ($1,'dc','Domain Controller','infrastructure','windows','provisioning',$2,$3::inet,NULL,$8::jsonb),
        ($1,'workstation','Windows Workstation','target','windows','provisioning',$4,$5::inet,NULL,$8::jsonb),
        ($1,'operator','Operator Terminal','operator','ubuntu','provisioning',$6,$7::inet,$9,$8::jsonb)
       RETURNING id,node_key,label,role,os_family,runtime_external_id,private_ip::text,lab_instance_id`,
      [
        runId,
        slot.dc_instance_id,
        slot.dc_private_ip,
        slot.workstation_instance_id,
        slot.workstation_private_ip,
        slot.operator_instance_id,
        slot.operator_private_ip,
        stringifyPostgresJson({ region: REGION, environmentId, prepared: true }),
        operatorLabInstanceId,
      ],
    );
    for (const row of nodeRows.rows) {
      nodes.push({
        id: row.id,
        nodeKey: row.node_key,
        label: row.label,
        role: row.role,
        osFamily: row.os_family,
        instanceId: row.runtime_external_id,
        privateIp: row.private_ip,
        labInstanceId: row.lab_instance_id || null,
      });
    }

    await client.query(
      `UPDATE operation_runs SET operator_lab_instance_id=$1,updated_at=NOW() WHERE id=$2`,
      [operatorLabInstanceId, runId],
    );
    await client.query(
      `UPDATE operation_environments SET status='starting',assigned_run_id=$1,last_error=NULL,updated_at=NOW() WHERE id=$2`,
      [runId, environmentId],
    );
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined);
    const dbError = error as { code?: string; constraint?: string } | null;
    if (dbError?.code === '23505' && dbError.constraint === ONE_LAB_INDEX) {
      throw new OperationRuntimeError('A lab allocation already exists for this account.', 409, 'OPERATION_LAB_SLOT_OCCUPIED');
    }
    throw error;
  } finally {
    client.release();
  }

  try {
    await ec2.send(new StartInstancesCommand({
      InstanceIds: [configured.dc, configured.workstation, configured.operator],
    }));
    return {
      runId,
      operatorLabInstanceId,
      environmentId,
      expiresAt,
      status: 'provisioning' as const,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message.slice(0, 800) : 'Prepared environment start failed';
    await Promise.all([
      args.pool.query(`UPDATE operation_runs SET status='failed',last_error=$1,updated_at=NOW() WHERE id=$2`, [message, runId]),
      args.pool.query(`UPDATE operation_nodes SET status='failed',last_error=$1,updated_at=NOW() WHERE run_id=$2`, [message, runId]),
      args.pool.query(`UPDATE lab_instances SET status='failed',last_error=$1,updated_at=NOW() WHERE id=$2 AND owner_id=$3`, [message, operatorLabInstanceId, args.ownerId]),
      args.pool.query(`UPDATE operation_environments SET status='failed',last_error=$1,updated_at=NOW() WHERE id=$2`, [message, environmentId]),
    ]);
    throw new OperationRuntimeError(message, 503, 'OPERATION_ENVIRONMENT_START_FAILED');
  }
}
