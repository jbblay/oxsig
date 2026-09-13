import 'server-only';

import {
  CreateReplaceRootVolumeTaskCommand,
  DescribeInstancesCommand,
  DescribeReplaceRootVolumeTasksCommand,
  EC2Client,
  StartInstancesCommand,
  StopInstancesCommand,
} from '@aws-sdk/client-ec2';
import type { Pool } from 'pg';
import { awsClientConfig } from '@/lib/aws/client-config';
import { stringifyPostgresJson } from '@/lib/db/postgres-safe';
import { operationReadinessError, probeOperationNodeReadiness } from '@/lib/operations/readiness';

const REGION = process.env.LAB_AWS_REGION || process.env.AWS_REGION || 'eu-central-1';
const ec2 = new EC2Client(awsClientConfig(REGION));
const TERMINAL_FAILURES = new Set(['failed', 'failing', 'failed-detached']);

type EnvironmentRow = {
  id: string;
  status: string;
  dc_instance_id: string;
  workstation_instance_id: string;
  operator_instance_id: string;
  dc_baseline_snapshot_id: string | null;
  workstation_baseline_snapshot_id: string | null;
  operator_baseline_snapshot_id: string | null;
  metadata: Record<string, unknown> | string | null;
};

type ResetTask = { role: string; instanceId: string; taskId: string };
type ResetProbe = { commandId?: string; commandStartedAt?: string; ready?: boolean };

function metadataObject(value: EnvironmentRow['metadata']) {
  if (value && typeof value === 'object' && !Array.isArray(value)) return value;
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) return parsed as Record<string, unknown>;
    } catch {}
  }
  return {} as Record<string, unknown>;
}

async function loadEnvironment(pool: Pool, environmentId: string) {
  const result = await pool.query(
    `SELECT id,status,dc_instance_id,workstation_instance_id,operator_instance_id,
            dc_baseline_snapshot_id,workstation_baseline_snapshot_id,operator_baseline_snapshot_id,metadata
       FROM operation_environments WHERE id=$1 LIMIT 1`,
    [environmentId],
  );
  return result.rows[0] as EnvironmentRow | undefined;
}

function environmentNodes(row: EnvironmentRow) {
  return [
    { role: 'dc', nodeKey: 'dc', osFamily: 'windows' as const, instanceId: row.dc_instance_id, snapshotId: row.dc_baseline_snapshot_id },
    { role: 'workstation', nodeKey: 'workstation', osFamily: 'windows' as const, instanceId: row.workstation_instance_id, snapshotId: row.workstation_baseline_snapshot_id },
    { role: 'operator', nodeKey: 'operator', osFamily: 'ubuntu' as const, instanceId: row.operator_instance_id, snapshotId: row.operator_baseline_snapshot_id },
  ];
}

async function stopEnvironmentNodesBestEffort(row: EnvironmentRow) {
  const instanceIds = environmentNodes(row).map((node) => node.instanceId);
  if (!instanceIds.length) return;
  await ec2.send(new StopInstancesCommand({ InstanceIds: instanceIds })).catch(() => undefined);
}

async function failReset(pool: Pool, environmentId: string, error: unknown) {
  const message = error instanceof Error ? error.message.slice(0, 800) : 'Prepared environment reset failed.';
  await pool.query(
    `UPDATE operation_environments
        SET status='failed',last_error=$1,
            metadata=metadata || $2::jsonb,updated_at=NOW()
      WHERE id=$3`,
    [message, stringifyPostgresJson({ resetPhase: 'failed', resetFailedAt: new Date().toISOString() }), environmentId],
  );
}

export async function beginPreparedEnvironmentReset(args: { pool: Pool; environmentId: string; runId: string }) {
  const row = await loadEnvironment(args.pool, args.environmentId);
  if (!row) throw new Error('Prepared Operation environment was not found.');
  const nodes = environmentNodes(row);
  if (nodes.some((node) => !node.snapshotId)) throw new Error('Prepared Operation environment has no complete baseline snapshot set.');

  const startedAt = new Date().toISOString();
  await args.pool.query(
    `UPDATE operation_environments
        SET status='resetting',assigned_run_id=NULL,last_error=NULL,
            metadata=(metadata - 'resetTasks' - 'resetReadiness') || $1::jsonb,updated_at=NOW()
      WHERE id=$2`,
    [stringifyPostgresJson({ resetPhase: 'starting', resetStartedAt: startedAt, resetAfterRunId: args.runId }), args.environmentId],
  );
  try {
    await ec2.send(new StartInstancesCommand({ InstanceIds: nodes.map((node) => node.instanceId) }));
  } catch (error) {
    // A multi-instance start may partially succeed. Never leave a failed reusable
    // reset consuming compute indefinitely; the next repair attempt can start all
    // nodes again from a known stopped baseline.
    await stopEnvironmentNodesBestEffort(row);
    await failReset(args.pool, args.environmentId, error);
    throw error;
  }
  return { environmentId: args.environmentId, status: 'resetting' as const, phase: 'starting' as const };
}

export async function advancePreparedEnvironmentReset(args: { pool: Pool; environmentId: string }) {
  const row = await loadEnvironment(args.pool, args.environmentId);
  if (!row) throw new Error('Prepared Operation environment was not found.');
  if (row.status === 'available') return { environmentId: row.id, status: 'available' as const, phase: 'complete' as const };
  if (row.status === 'failed') return { environmentId: row.id, status: 'failed' as const, phase: 'failed' as const };
  if (row.status !== 'resetting') return { environmentId: row.id, status: row.status, phase: 'idle' as const };

  const metadata = metadataObject(row.metadata);
  const phase = typeof metadata.resetPhase === 'string' ? metadata.resetPhase : 'starting';
  const nodes = environmentNodes(row);

  try {
    if (phase === 'starting') {
      const described = await ec2.send(new DescribeInstancesCommand({ InstanceIds: nodes.map((node) => node.instanceId) }));
      const states = new Map(
        (described.Reservations || []).flatMap((reservation) => reservation.Instances || [])
          .filter((instance) => instance.InstanceId)
          .map((instance) => [instance.InstanceId!, instance.State?.Name || 'unknown']),
      );
      if (!nodes.every((node) => states.get(node.instanceId) === 'running')) {
        return { environmentId: row.id, status: 'resetting' as const, phase: 'starting' as const };
      }

      const claimed = await args.pool.query(
        `UPDATE operation_environments
            SET metadata=metadata || $1::jsonb,updated_at=NOW()
          WHERE id=$2 AND status='resetting' AND metadata->>'resetPhase'='starting'`,
        [stringifyPostgresJson({ resetPhase: 'creating-replacements' }), row.id],
      );
      if (!claimed.rowCount) return { environmentId: row.id, status: 'resetting' as const, phase: 'creating-replacements' as const };

      const tasks = await Promise.all(nodes.map(async (node) => {
        const response = await ec2.send(new CreateReplaceRootVolumeTaskCommand({
          InstanceId: node.instanceId,
          SnapshotId: node.snapshotId!,
          DeleteReplacedRootVolume: true,
        }));
        const taskId = response.ReplaceRootVolumeTask?.ReplaceRootVolumeTaskId;
        if (!taskId) throw new Error(`AWS did not return a root replacement task for ${node.role}.`);
        return { role: node.role, instanceId: node.instanceId, taskId };
      }));
      await args.pool.query(
        `UPDATE operation_environments
            SET metadata=metadata || $1::jsonb,updated_at=NOW()
          WHERE id=$2`,
        [stringifyPostgresJson({ resetPhase: 'replacing', resetTasks: tasks }), row.id],
      );
      return { environmentId: row.id, status: 'resetting' as const, phase: 'replacing' as const };
    }

    if (phase === 'creating-replacements') {
      return { environmentId: row.id, status: 'resetting' as const, phase };
    }

    if (phase === 'replacing') {
      const tasks = Array.isArray(metadata.resetTasks) ? metadata.resetTasks as ResetTask[] : [];
      if (tasks.length !== nodes.length) throw new Error('Prepared environment reset task state is incomplete.');
      const response = await ec2.send(new DescribeReplaceRootVolumeTasksCommand({
        ReplaceRootVolumeTaskIds: tasks.map((task) => task.taskId),
      }));
      const states = new Map((response.ReplaceRootVolumeTasks || []).map((task) => [task.ReplaceRootVolumeTaskId!, task.TaskState || 'unknown']));
      const failed = [...states.values()].find((state) => TERMINAL_FAILURES.has(state));
      if (failed) throw new Error(`A root replacement task entered ${failed}.`);
      if (!tasks.every((task) => states.get(task.taskId) === 'succeeded')) {
        return { environmentId: row.id, status: 'resetting' as const, phase: 'replacing' as const };
      }
      await args.pool.query(
        `UPDATE operation_environments
            SET metadata=(metadata - 'resetReadiness') || $1::jsonb,updated_at=NOW()
          WHERE id=$2`,
        [stringifyPostgresJson({ resetPhase: 'verifying', resetReadiness: {} }), row.id],
      );
      return { environmentId: row.id, status: 'resetting' as const, phase: 'verifying' as const };
    }

    if (phase === 'verifying') {
      const previous = metadata.resetReadiness && typeof metadata.resetReadiness === 'object'
        ? metadata.resetReadiness as Record<string, ResetProbe> : {};
      const checkedAt = new Date().toISOString();
      const results = await Promise.all(nodes.map(async (node) => {
        if (previous[node.role]?.ready) return { node, result: { ready: true as const, reason: 'ready' as const } };
        const result = await probeOperationNodeReadiness({
          instanceId: node.instanceId,
          nodeKey: node.nodeKey,
          osFamily: node.osFamily,
          commandId: previous[node.role]?.commandId,
          commandStartedAt: previous[node.role]?.commandStartedAt,
        });
        return { node, result };
      }));
      const next: Record<string, ResetProbe> = { ...previous };
      for (const { node, result } of results) {
        if (result.reason === 'probe-failed') throw new Error(result.error || `Reset verification failed for ${node.role}.`);
        next[node.role] = {
          ready: result.ready,
          commandId: result.commandId,
          commandStartedAt: result.commandId ? previous[node.role]?.commandStartedAt || checkedAt : undefined,
        };
      }
      await args.pool.query(
        `UPDATE operation_environments SET metadata=metadata || $1::jsonb,updated_at=NOW() WHERE id=$2`,
        [stringifyPostgresJson({ resetReadiness: next }), row.id],
      );
      if (!results.every(({ result }) => result.ready)) {
        return { environmentId: row.id, status: 'resetting' as const, phase: 'verifying' as const };
      }
      await ec2.send(new StopInstancesCommand({ InstanceIds: nodes.map((node) => node.instanceId) }));
      await args.pool.query(
        `UPDATE operation_environments
            SET metadata=metadata || $1::jsonb,updated_at=NOW()
          WHERE id=$2`,
        [stringifyPostgresJson({ resetPhase: 'stopping' }), row.id],
      );
      return { environmentId: row.id, status: 'resetting' as const, phase: 'stopping' as const };
    }

    if (phase === 'stopping') {
      const described = await ec2.send(new DescribeInstancesCommand({ InstanceIds: nodes.map((node) => node.instanceId) }));
      const states = new Map(
        (described.Reservations || []).flatMap((reservation) => reservation.Instances || [])
          .filter((instance) => instance.InstanceId)
          .map((instance) => [instance.InstanceId!, instance.State?.Name || 'unknown']),
      );
      if (!nodes.every((node) => states.get(node.instanceId) === 'stopped')) {
        return { environmentId: row.id, status: 'resetting' as const, phase: 'stopping' as const };
      }
      await args.pool.query(
        `UPDATE operation_environments
            SET status='available',last_error=NULL,
                metadata=(metadata - 'resetTasks' - 'resetReadiness') || $1::jsonb,updated_at=NOW()
          WHERE id=$2 AND status='resetting'`,
        [stringifyPostgresJson({ resetPhase: 'complete', resetCompletedAt: new Date().toISOString(), resetRequired: false }), row.id],
      );
      return { environmentId: row.id, status: 'available' as const, phase: 'complete' as const };
    }

    throw new Error(`Unknown prepared environment reset phase: ${phase}`);
  } catch (error) {
    // Reset failures are terminal for this attempt. Best-effort stop the reusable
    // compute before persisting the failure so authorization/provider regressions
    // cannot leave three paid instances running indefinitely.
    await stopEnvironmentNodesBestEffort(row);
    await failReset(args.pool, row.id, error);
    return {
      environmentId: row.id,
      status: 'failed' as const,
      phase: 'failed' as const,
      error: operationReadinessError(error, `environment-reset:${phase}`),
    };
  }
}

export async function advanceAllPreparedEnvironmentResets(pool: Pool) {
  const rows = await pool.query(
    `SELECT id FROM operation_environments
      WHERE status='resetting'
      ORDER BY updated_at ASC
      LIMIT 10`,
  );
  return Promise.all(rows.rows.map((row) =>
    advancePreparedEnvironmentReset({ pool, environmentId: row.id as string })
  ));
}
