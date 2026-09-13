import 'server-only';

import type { Pool, PoolClient } from 'pg';
import { describeLabVmStates, destroyLabVm } from './aws-runtime';
import type { LabInstanceStatus } from './types';

const RECONCILE_LOCK_NAMESPACE = 'oxsig-lab-status-reconcile';
const MIN_RECONCILE_INTERVAL_MS = 3_000;
const RECONCILIATION_WARNING =
  'Lab status could not be confirmed with the cloud provider. Showing the last known state.';
const EXPIRY_WARNING =
  'Lab expiry cleanup could not be confirmed. Automated cleanup will retry.';

type ReconciliationRow = {
  id: string;
  status: LabInstanceStatus;
  runtime_provider?: string | null;
  runtime_external_id?: string | null;
  expires_at?: string | Date | null;
  runtime_observed_at?: string | Date | null;
  reconciliation_warning?: string | null;
};

export type LabReconciliationResult = {
  checkedAt: string;
  reconciled: number;
  failed: number;
  cleanupRequested: number;
  skipped: boolean;
  reason?: 'reconciliation_already_running' | 'nothing_to_reconcile' | 'recently_reconciled';
};

type ReconciliationDependencies = {
  describeStates: typeof describeLabVmStates;
  destroyVm: typeof destroyLabVm;
  now: () => Date;
};

const defaultDependencies: ReconciliationDependencies = {
  describeStates: describeLabVmStates,
  destroyVm: destroyLabVm,
  now: () => new Date(),
};

const inFlightReconciliations = new Map<string, Promise<LabReconciliationResult>>();

async function persistProviderFailure(
  client: PoolClient,
  ownerId: string,
  ids: string[],
  warning = RECONCILIATION_WARNING
) {
  if (ids.length === 0) return;
  await client.query(
    `UPDATE lab_instances
        SET reconciliation_warning=$1
      WHERE owner_id=$2
        AND id = ANY($3::uuid[])`,
    [warning, ownerId, ids]
  );
}

async function runReconciliation(
  pool: Pool,
  ownerId: string,
  dependencies: ReconciliationDependencies
): Promise<LabReconciliationResult> {
  const client = await pool.connect();
  const checkedAt = dependencies.now().toISOString();
  let lockAcquired = false;

  try {
    const lock = await client.query(
      `SELECT pg_try_advisory_lock(hashtext($1), hashtext($2)) AS acquired`,
      [RECONCILE_LOCK_NAMESPACE, ownerId]
    );
    lockAcquired = Boolean(lock.rows[0]?.acquired);
    if (!lockAcquired) {
      return {
        checkedAt,
        reconciled: 0,
        failed: 0,
        cleanupRequested: 0,
        skipped: true,
        reason: 'reconciliation_already_running',
      };
    }

    const result = await client.query(
      `SELECT id::text AS id,status,runtime_provider,runtime_external_id,expires_at,
              runtime_observed_at,reconciliation_warning
         FROM lab_instances
        WHERE owner_id=$1
          AND runtime_provider='aws-ec2'
          AND runtime_external_id IS NOT NULL
          AND status <> 'destroyed'
          AND NOT (metadata ? 'environmentId')
        ORDER BY created_at DESC
        LIMIT 20`,
      [ownerId]
    );

    // Reusable Operation environments have their own reset lifecycle. Excluding
    // rows carrying environmentId here prevents ordinary lab expiry cleanup from
    // ever terminating a permanent prepared Operation node.
    const rows = (result.rows as ReconciliationRow[]).filter((row) => Boolean(row.runtime_external_id));
    if (rows.length === 0) {
      return {
        checkedAt,
        reconciled: 0,
        failed: 0,
        cleanupRequested: 0,
        skipped: true,
        reason: 'nothing_to_reconcile',
      };
    }

    const expiryFailures = new Set<string>();
    let cleanupRequested = 0;
    const nowMs = dependencies.now().getTime();
    const targetRows = rows.filter((row) => {
      const expiry = row.expires_at ? new Date(row.expires_at).getTime() : Number.NaN;
      if (Number.isFinite(expiry) && expiry <= nowMs) return true;
      if (row.reconciliation_warning) return true;
      const observedAt = row.runtime_observed_at ? new Date(row.runtime_observed_at).getTime() : Number.NaN;
      return !Number.isFinite(observedAt) || nowMs - observedAt >= MIN_RECONCILE_INTERVAL_MS;
    });

    if (targetRows.length === 0) {
      return {
        checkedAt,
        reconciled: 0,
        failed: 0,
        cleanupRequested: 0,
        skipped: true,
        reason: 'recently_reconciled',
      };
    }

    for (const row of targetRows) {
      const expiry = row.expires_at ? new Date(row.expires_at).getTime() : Number.NaN;
      if (
        Number.isFinite(expiry) &&
        expiry <= nowMs &&
        !['destroying', 'destroyed', 'failed'].includes(row.status)
      ) {
        try {
          await dependencies.destroyVm(row.runtime_external_id!);
          cleanupRequested += 1;
        } catch (error) {
          expiryFailures.add(row.id);
          console.error('Cyber Lab expiry reconciliation failed', {
            stage: 'expiry_cleanup',
            labInstanceId: row.id,
            error,
          });
        }
      }
    }

    let states: Map<string, LabInstanceStatus>;
    try {
      states = await dependencies.describeStates(targetRows.map((row) => row.runtime_external_id!));
    } catch (error) {
      await persistProviderFailure(client, ownerId, targetRows.map((row) => row.id));
      console.error('Cyber Lab status reconciliation failed', {
        stage: 'ec2_state_lookup',
        ownerId,
        error,
      });
      return {
        checkedAt,
        reconciled: 0,
        failed: targetRows.length,
        cleanupRequested,
        skipped: false,
      };
    }

    let reconciled = 0;
    let failed = 0;
    for (const row of targetRows) {
      const status = states.get(row.runtime_external_id!);
      if (!status) {
        failed += 1;
        await persistProviderFailure(client, ownerId, [row.id]);
        continue;
      }

      const warning = expiryFailures.has(row.id) ? EXPIRY_WARNING : null;
      const isDestroyed = status === 'destroyed';
      const isRunning = status === 'running';
      const isStopped = status === 'stopped';

      await client.query(
        `UPDATE lab_instances
            SET status=$1::varchar(32),
                runtime_observed_at=$2::timestamptz,
                reconciliation_warning=$3,
                last_error=CASE WHEN $4::boolean THEN NULL ELSE last_error END,
                started_at=CASE WHEN $5::boolean AND started_at IS NULL THEN NOW() ELSE started_at END,
                stopped_at=CASE WHEN $6::boolean THEN NOW() ELSE stopped_at END,
                updated_at=CASE
                  WHEN status IS DISTINCT FROM $1::varchar(32) THEN NOW()
                  ELSE updated_at
                END
          WHERE id=$7 AND owner_id=$8`,
        [status, checkedAt, warning, isDestroyed, isRunning, isStopped, row.id, ownerId]
      );
      reconciled += 1;
      if (warning) failed += 1;
    }

    return {
      checkedAt,
      reconciled,
      failed,
      cleanupRequested,
      skipped: false,
    };
  } finally {
    if (lockAcquired) {
      await client.query(
        `SELECT pg_advisory_unlock(hashtext($1), hashtext($2))`,
        [RECONCILE_LOCK_NAMESPACE, ownerId]
      ).catch((error) => {
        console.error('Cyber Lab reconciliation lock release failed', { ownerId, error });
      });
    }
    client.release();
  }
}

export function reconcileOwnedLabReadModel(
  pool: Pool,
  ownerId: string,
  dependencies: Partial<ReconciliationDependencies> = {}
): Promise<LabReconciliationResult> {
  const existing = inFlightReconciliations.get(ownerId);
  if (existing) return existing;

  const resolvedDependencies = { ...defaultDependencies, ...dependencies };
  const request = runReconciliation(pool, ownerId, resolvedDependencies);
  inFlightReconciliations.set(ownerId, request);

  const clearInFlight = () => {
    if (inFlightReconciliations.get(ownerId) === request) {
      inFlightReconciliations.delete(ownerId);
    }
  };
  void request.then(clearInFlight, clearInFlight);

  return request;
}
