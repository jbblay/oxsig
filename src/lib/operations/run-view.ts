import type { Pool } from 'pg';
import { getOperationRun } from '@/lib/operations/runtime';

type Args = { pool: Pool; runId: string; ownerId: string };

/**
 * Reusable environments may temporarily start their backing EC2 instances while
 * restoring baseline snapshots after a learner ends a run. Those provider
 * machines no longer belong to the ended learner run, so their reset-time state
 * must never resurrect that run from `destroyed` back to `running`.
 */
export async function getLearnerOperationRun(args: Args) {
  const durable = await args.pool.query(
    `SELECT status,environment_id
       FROM operation_runs
      WHERE id=$1 AND owner_id=$2
      LIMIT 1`,
    [args.runId, args.ownerId],
  );
  const row = durable.rows[0] as { status?: string; environment_id?: string | null } | undefined;
  const endedReusableRun = row?.status === 'destroyed' && Boolean(row.environment_id);

  const run = await getOperationRun(args);
  if (!endedReusableRun || run.status === 'destroyed') return run;

  // getOperationRun reconciles live EC2 state for active runs. If a reusable
  // environment is currently resetting, undo any transient status promotion and
  // keep the learner-owned run terminal.
  await args.pool.query(
    `UPDATE operation_runs
        SET status='destroyed',updated_at=NOW()
      WHERE id=$1 AND owner_id=$2 AND status <> 'destroyed'`,
    [args.runId, args.ownerId],
  );

  return {
    ...run,
    status: 'destroyed' as const,
    nodes: run.nodes.map((node) => ({
      ...node,
      status: 'destroyed',
      readiness: 'unavailable',
    })),
  };
}
