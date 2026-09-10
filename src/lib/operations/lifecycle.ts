import 'server-only';

import {
  DescribeInstancesCommand,
  EC2Client,
  StartInstancesCommand,
  StopInstancesCommand,
} from '@aws-sdk/client-ec2';
import type { Pool, PoolClient } from 'pg';
import { awsClientConfig } from '@/lib/aws/client-config';

const REGION = process.env.LAB_AWS_REGION || process.env.AWS_REGION || 'eu-central-1';
const ec2 = new EC2Client(awsClientConfig(REGION));

export class OperationLifecycleError extends Error {
  constructor(message: string, readonly status = 409, readonly code = 'OPERATION_LIFECYCLE_CONFLICT') {
    super(message);
    this.name = 'OperationLifecycleError';
  }
}

type OwnedRun = {
  id: string;
  status: string;
  expires_at: string | Date;
  operator_lab_instance_id: string | null;
  metadata: Record<string, unknown> | null;
};

async function getOwnedRun(pool: Pool, runId: string, ownerId: string): Promise<OwnedRun> {
  const result = await pool.query(
    `SELECT id,status,expires_at,operator_lab_instance_id,metadata
       FROM operation_runs
      WHERE id=$1 AND owner_id=$2
      LIMIT 1`,
    [runId, ownerId]
  );
  const run = result.rows[0] as OwnedRun | undefined;
  if (!run) throw new OperationLifecycleError('Operation run not found.', 404, 'OPERATION_RUN_NOT_FOUND');
  return run;
}

async function getRuntimeIds(pool: Pool, runId: string) {
  const result = await pool.query(
    `SELECT runtime_external_id
       FROM operation_nodes
      WHERE run_id=$1 AND runtime_external_id IS NOT NULL`,
    [runId]
  );
  return [...new Set(result.rows.map((row) => String(row.runtime_external_id || '')).filter(Boolean))];
}

async function getEc2States(ids: string[]) {
  const states = new Map<string, string>();
  if (!ids.length) return states;
  const response = await ec2.send(new DescribeInstancesCommand({ InstanceIds: ids }));
  for (const reservation of response.Reservations || []) {
    for (const instance of reservation.Instances || []) {
      if (instance.InstanceId) states.set(instance.InstanceId, instance.State?.Name || 'unknown');
    }
  }
  return states;
}

async function inTransaction<T>(pool: Pool, work: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await work(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

export async function pauseOperationRun(args: { pool: Pool; runId: string; ownerId: string }) {
  const run = await getOwnedRun(args.pool, args.runId, args.ownerId);
  if (['destroying', 'destroyed', 'failed'].includes(run.status)) {
    throw new OperationLifecycleError('This Operation cannot be paused in its current state.', 409, 'OPERATION_NOT_PAUSABLE');
  }
  if (run.metadata?.lifecycleState === 'paused') {
    return { paused: true, alreadyPaused: true, stopping: 0 };
  }
  if (run.status !== 'running') {
    throw new OperationLifecycleError('Wait until the Operation is ready before pausing it, or use End & destroy to terminate it now.', 409, 'OPERATION_NOT_READY_TO_PAUSE');
  }

  const ids = await getRuntimeIds(args.pool, args.runId);
  if (!ids.length) throw new OperationLifecycleError('The Operation has no EC2 runtimes to pause.', 409, 'OPERATION_RUNTIME_MISSING');
  const states = await getEc2States(ids);
  const runningIds = ids.filter((id) => states.get(id) === 'running');
  if (runningIds.length !== ids.length) {
    throw new OperationLifecycleError('All Operation machines must be running before the environment can be paused safely.', 409, 'OPERATION_NODES_NOT_RUNNING');
  }

  await ec2.send(new StopInstancesCommand({ InstanceIds: runningIds }));
  try {
    await inTransaction(args.pool, async (client) => {
      await client.query(
        `UPDATE operation_runs
            SET status='provisioning',
                metadata=jsonb_set(metadata, '{lifecycleState}', '"paused"'::jsonb, true),
                updated_at=NOW()
          WHERE id=$1 AND owner_id=$2`,
        [args.runId, args.ownerId]
      );
      await client.query(
        `UPDATE operation_nodes
            SET status='provisioning', updated_at=NOW()
          WHERE run_id=$1 AND status NOT IN ('destroying','destroyed','failed')`,
        [args.runId]
      );
      if (run.operator_lab_instance_id) {
        await client.query(
          `UPDATE lab_instances
              SET status='stopping', updated_at=NOW()
            WHERE id=$1 AND owner_id=$2 AND status NOT IN ('destroying','destroyed','failed')`,
          [run.operator_lab_instance_id, args.ownerId]
        );
      }
    });
  } catch (error) {
    // The provider action happened first. Best-effort compensation keeps AWS and
    // database truth aligned if the durable state transition cannot commit.
    await ec2.send(new StartInstancesCommand({ InstanceIds: runningIds })).catch(() => undefined);
    throw error;
  }

  return { paused: true, alreadyPaused: false, stopping: runningIds.length };
}

export async function resumeOperationRun(args: { pool: Pool; runId: string; ownerId: string }) {
  const run = await getOwnedRun(args.pool, args.runId, args.ownerId);
  if (['destroying', 'destroyed', 'failed'].includes(run.status)) {
    throw new OperationLifecycleError('This Operation cannot be resumed in its current state.', 409, 'OPERATION_NOT_RESUMABLE');
  }
  if (new Date(run.expires_at).getTime() <= Date.now()) {
    throw new OperationLifecycleError('This Operation has expired and cannot be resumed.', 410, 'OPERATION_EXPIRED');
  }
  if (run.metadata?.lifecycleState !== 'paused') {
    throw new OperationLifecycleError('This Operation is not paused.', 409, 'OPERATION_NOT_PAUSED');
  }

  const ids = await getRuntimeIds(args.pool, args.runId);
  if (!ids.length) throw new OperationLifecycleError('The Operation has no EC2 runtimes to resume.', 409, 'OPERATION_RUNTIME_MISSING');
  const states = await getEc2States(ids);
  const stoppedIds = ids.filter((id) => states.get(id) === 'stopped');
  if (stoppedIds.length !== ids.length) {
    throw new OperationLifecycleError('The Operation is still stopping. Wait until all machines are stopped, then resume.', 409, 'OPERATION_NODES_NOT_STOPPED');
  }

  await ec2.send(new StartInstancesCommand({ InstanceIds: stoppedIds }));
  try {
    await inTransaction(args.pool, async (client) => {
      await client.query(
        `UPDATE operation_runs
            SET status='provisioning',
                metadata=jsonb_set(metadata, '{lifecycleState}', '"active"'::jsonb, true),
                last_error=NULL,
                updated_at=NOW()
          WHERE id=$1 AND owner_id=$2`,
        [args.runId, args.ownerId]
      );
      await client.query(
        `UPDATE operation_nodes
            SET status='provisioning',
                metadata=metadata - 'bootstrapReadyAt' - 'readinessCheckedAt' - 'readinessReason' - 'readinessCommandId' - 'readinessCommandStartedAt' - 'readinessError',
                last_error=NULL,
                updated_at=NOW()
          WHERE run_id=$1 AND status NOT IN ('destroying','destroyed','failed')`,
        [args.runId]
      );
      if (run.operator_lab_instance_id) {
        await client.query(
          `UPDATE lab_instances
              SET status='provisioning', last_error=NULL, updated_at=NOW()
            WHERE id=$1 AND owner_id=$2 AND status NOT IN ('destroying','destroyed','failed')`,
          [run.operator_lab_instance_id, args.ownerId]
        );
      }
    });
  } catch (error) {
    await ec2.send(new StopInstancesCommand({ InstanceIds: stoppedIds })).catch(() => undefined);
    throw error;
  }

  return { resumed: true, starting: stoppedIds.length };
}

