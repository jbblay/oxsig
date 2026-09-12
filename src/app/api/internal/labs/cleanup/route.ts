import { stringifyPostgresJson } from '@/lib/db/postgres-safe';
import { timingSafeEqual } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { getPool } from '@/lib/db/pool';
import {
  describeLabVmStates,
  destroyLabVm,
  listExpiredTaggedLabVms,
} from '@/lib/labs/aws-runtime';
import { listExpiredTaggedOperationNodes } from '@/lib/operations/cleanup';
import { advanceAllPreparedEnvironmentResets } from '@/lib/operations/environment-reset';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const CLEANUP_LOCK_NAMESPACE = 'oxsig';
const CLEANUP_LOCK_NAME = 'labs-expiry-cleanup';

type CleanupCandidate = {
  externalId: string;
  labInstanceId?: string;
  operationRunId?: string;
  operationNodeId?: string;
};

function isAuthorizedCron(request: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const actual = request.headers.get('authorization') || '';
  const expected = `Bearer ${secret}`;
  const actualBuffer = Buffer.from(actual);
  const expectedBuffer = Buffer.from(expected);
  return actualBuffer.length === expectedBuffer.length && timingSafeEqual(actualBuffer, expectedBuffer);
}

function isMissingInstance(error: unknown): boolean {
  return typeof error === 'object' && error !== null &&
    'name' in error && (error as { name?: string }).name === 'InvalidInstanceID.NotFound';
}

async function reconcileOperationRuns(client: { query: (sql: string, params?: unknown[]) => Promise<any> }) {
  return client.query(
    `UPDATE operation_runs run
        SET status = CASE
              WHEN EXISTS (
                SELECT 1 FROM operation_nodes node
                 WHERE node.run_id=run.id AND node.status='failed'
              ) THEN 'failed'
              WHEN NOT EXISTS (
                SELECT 1 FROM operation_nodes node
                 WHERE node.run_id=run.id AND node.status NOT IN ('destroyed','failed')
              ) THEN 'destroyed'
              ELSE 'destroying'
            END,
            updated_at=NOW()
      WHERE run.expires_at <= NOW()
        AND run.status NOT IN ('destroyed','failed')
        AND EXISTS (SELECT 1 FROM operation_nodes node WHERE node.run_id=run.id)
      RETURNING id,status`
  );
}

export async function GET(request: NextRequest) {
  if (!process.env.CRON_SECRET) {
    return NextResponse.json({ error: 'CRON_SECRET is not configured' }, { status: 503 });
  }
  if (!isAuthorizedCron(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  if (process.env.LAB_AWS_ENABLED !== 'true') {
    return NextResponse.json({
      ok: true,
      skipped: true,
      reason: 'aws_labs_disabled',
      checkedAt: new Date().toISOString(),
    });
  }

  const pool = getPool();
  const client = await pool.connect();
  let lockAcquired = false;
  let releaseWithError = false;

  try {
    const lock = await client.query(
      `SELECT pg_try_advisory_lock(hashtext($1), hashtext($2)) AS acquired`,
      [CLEANUP_LOCK_NAMESPACE, CLEANUP_LOCK_NAME]
    );
    lockAcquired = Boolean(lock.rows[0]?.acquired);
    if (!lockAcquired) {
      return NextResponse.json({
        ok: true,
        skipped: true,
        reason: 'cleanup_already_running',
        checkedAt: new Date().toISOString(),
      }, { status: 202 });
    }

    const now = new Date();
    const [dbExpiredLabs, awsExpiredLabs, dbExpiredOperationNodes, awsExpiredOperationNodes] = await Promise.all([
      client.query(
        `SELECT id::text AS id, runtime_external_id
           FROM lab_instances
          WHERE runtime_provider='aws-ec2'
            AND expires_at IS NOT NULL
            AND expires_at <= NOW()
            AND status NOT IN ('destroyed','failed')
            AND NOT (metadata ? 'environmentId')
          ORDER BY expires_at ASC`
      ),
      listExpiredTaggedLabVms(now),
      client.query(
        `SELECT node.id::text AS id,
                node.run_id::text AS run_id,
                node.runtime_external_id
           FROM operation_nodes node
           JOIN operation_runs run ON run.id=node.run_id
          WHERE run.expires_at <= NOW()
            AND run.environment_id IS NULL
            AND node.status NOT IN ('destroyed','failed')
          ORDER BY run.expires_at ASC,node.created_at ASC`
      ),
      listExpiredTaggedOperationNodes(now),
    ]);

    const candidates = new Map<string, CleanupCandidate>();
    for (const row of dbExpiredLabs.rows) {
      if (!row.runtime_external_id) continue;
      candidates.set(row.runtime_external_id, { externalId: row.runtime_external_id, labInstanceId: row.id });
    }
    for (const item of awsExpiredLabs) {
      const existing = candidates.get(item.externalId);
      candidates.set(item.externalId, {
        externalId: item.externalId,
        labInstanceId: existing?.labInstanceId || item.labInstanceId,
      });
    }
    for (const row of dbExpiredOperationNodes.rows) {
      if (!row.runtime_external_id) continue;
      const existing = candidates.get(row.runtime_external_id);
      candidates.set(row.runtime_external_id, {
        ...existing,
        externalId: row.runtime_external_id,
        operationRunId: row.run_id,
        operationNodeId: row.id,
      });
    }
    for (const item of awsExpiredOperationNodes) {
      const existing = candidates.get(item.externalId);
      candidates.set(item.externalId, {
        ...existing,
        externalId: item.externalId,
        operationRunId: existing?.operationRunId || item.operationRunId,
        operationNodeId: existing?.operationNodeId || item.operationNodeId,
      });
    }

    let terminationAccepted = 0;
    let destroyedConfirmed = 0;
    let alreadyGone = 0;
    let labsReconciled = 0;
    let operationNodesReconciled = 0;
    let eventsWritten = 0;
    const failures: Array<{ externalId: string; error: string }> = [];

    for (const candidate of candidates.values()) {
      try {
        await destroyLabVm(candidate.externalId);
        terminationAccepted += 1;
        const states = await describeLabVmStates([candidate.externalId]);
        const status = states.get(candidate.externalId) === 'destroyed' ? 'destroyed' : 'destroying';
        if (status === 'destroyed') destroyedConfirmed += 1;

        const updatedLabs = await client.query(
          `UPDATE lab_instances
              SET status=$1,
                  runtime_external_id=COALESCE(runtime_external_id,$2),
                  last_error=NULL,
                  updated_at=NOW()
            WHERE (runtime_external_id=$2 OR id::text=$3)
              AND status NOT IN ('destroyed','failed')
            RETURNING id`,
          [status, candidate.externalId, candidate.labInstanceId || '']
        );
        labsReconciled += updatedLabs.rowCount || 0;
        for (const row of updatedLabs.rows) {
          await client.query(
            `INSERT INTO lab_events (lab_instance_id,event_type,source,payload)
             VALUES ($1,'expired_cleanup','scheduler',$2)`,
            [row.id, stringifyPostgresJson({ provider: 'aws-ec2', externalId: candidate.externalId, status })]
          );
          eventsWritten += 1;
        }

        const updatedNodes = await client.query(
          `UPDATE operation_nodes
              SET status=$1,
                  runtime_external_id=COALESCE(runtime_external_id,$2),
                  last_error=NULL,
                  updated_at=NOW()
            WHERE (runtime_external_id=$2 OR id::text=$3)
              AND status NOT IN ('destroyed','failed')
            RETURNING id,run_id`,
          [status, candidate.externalId, candidate.operationNodeId || '']
        );
        operationNodesReconciled += updatedNodes.rowCount || 0;
      } catch (error) {
        if (isMissingInstance(error)) {
          alreadyGone += 1;
          const updatedLabs = await client.query(
            `UPDATE lab_instances
                SET status='destroyed',last_error=NULL,updated_at=NOW()
              WHERE (runtime_external_id=$1 OR id::text=$2)
                AND status NOT IN ('destroyed','failed')
              RETURNING id`,
            [candidate.externalId, candidate.labInstanceId || '']
          );
          labsReconciled += updatedLabs.rowCount || 0;
          for (const row of updatedLabs.rows) {
            await client.query(
              `INSERT INTO lab_events (lab_instance_id,event_type,source,payload)
               VALUES ($1,'expired_cleanup_missing_instance','scheduler',$2)`,
              [row.id, stringifyPostgresJson({ provider: 'aws-ec2', externalId: candidate.externalId, status: 'destroyed', reason: 'missing_instance' })]
            );
            eventsWritten += 1;
          }
          const updatedNodes = await client.query(
            `UPDATE operation_nodes
                SET status='destroyed',last_error=NULL,updated_at=NOW()
              WHERE (runtime_external_id=$1 OR id::text=$2)
                AND status NOT IN ('destroyed','failed')
              RETURNING id`,
            [candidate.externalId, candidate.operationNodeId || '']
          );
          operationNodesReconciled += updatedNodes.rowCount || 0;
          continue;
        }

        const message = error instanceof Error ? error.message.slice(0, 500) : 'AWS termination failed';
        failures.push({ externalId: candidate.externalId, error: message });
        await Promise.all([
          client.query(
            `UPDATE lab_instances SET last_error=$1,updated_at=NOW()
              WHERE (runtime_external_id=$2 OR id::text=$3) AND status NOT IN ('destroyed','failed')`,
            [message, candidate.externalId, candidate.labInstanceId || '']
          ),
          client.query(
            `UPDATE operation_nodes SET last_error=$1,updated_at=NOW()
              WHERE (runtime_external_id=$2 OR id::text=$3) AND status NOT IN ('destroyed','failed')`,
            [message, candidate.externalId, candidate.operationNodeId || '']
          ),
        ]);
      }
    }

    const taggedLabIds = new Set(awsExpiredLabs.map((item) => item.labInstanceId).filter(Boolean));
    let expiredWithoutRuntime = 0;
    for (const row of dbExpiredLabs.rows) {
      if (row.runtime_external_id || taggedLabIds.has(row.id)) continue;
      const result = await client.query(
        `UPDATE lab_instances
            SET status='failed',
                last_error='Expired before an AWS runtime identifier was recorded; scheduled cleanup found no tagged EC2 instance.',
                updated_at=NOW()
          WHERE id::text=$1
            AND runtime_external_id IS NULL
            AND status NOT IN ('destroyed','failed')
          RETURNING id`,
        [row.id]
      );
      expiredWithoutRuntime += result.rowCount || 0;
      labsReconciled += result.rowCount || 0;
      for (const updated of result.rows) {
        await client.query(
          `INSERT INTO lab_events (lab_instance_id,event_type,source,payload)
           VALUES ($1,'expired_cleanup_runtime_missing','scheduler',$2)`,
          [updated.id, stringifyPostgresJson({ provider: 'aws-ec2', status: 'failed', reason: 'runtime_external_id_missing' })]
        );
        eventsWritten += 1;
      }
    }

    const taggedOperationNodeIds = new Set(awsExpiredOperationNodes.map((item) => item.operationNodeId).filter(Boolean));
    let operationNodesWithoutRuntime = 0;
    for (const row of dbExpiredOperationNodes.rows) {
      if (row.runtime_external_id || taggedOperationNodeIds.has(row.id)) continue;
      const result = await client.query(
        `UPDATE operation_nodes
            SET status='failed',
                last_error='Operation node expired before a runtime identifier was recorded; cleanup found no tagged EC2 instance.',
                updated_at=NOW()
          WHERE id::text=$1
            AND runtime_external_id IS NULL
            AND status NOT IN ('destroyed','failed')
          RETURNING id`,
        [row.id]
      );
      operationNodesWithoutRuntime += result.rowCount || 0;
      operationNodesReconciled += result.rowCount || 0;
    }

    const operationRuns = await reconcileOperationRuns(client);
    const environmentResets = await advanceAllPreparedEnvironmentResets(pool);

    return NextResponse.json({
      ok: failures.length === 0,
      checkedAt: now.toISOString(),
      databaseExpired: dbExpiredLabs.rowCount || 0,
      awsTaggedExpired: awsExpiredLabs.length,
      operationDatabaseExpired: dbExpiredOperationNodes.rowCount || 0,
      operationAwsTaggedExpired: awsExpiredOperationNodes.length,
      terminationAccepted,
      destroyedConfirmed,
      alreadyGone,
      candidateCount: candidates.size,
      labsReconciled,
      operationNodesReconciled,
      operationRunsReconciled: operationRuns.rowCount || 0,
      environmentResets,
      eventsWritten,
      expiredWithoutRuntime,
      operationNodesWithoutRuntime,
      failures,
    }, { status: failures.length === 0 ? 200 : 207 });
  } finally {
    if (lockAcquired) {
      try {
        await client.query(
          `SELECT pg_advisory_unlock(hashtext($1), hashtext($2))`,
          [CLEANUP_LOCK_NAMESPACE, CLEANUP_LOCK_NAME]
        );
      } catch (error) {
        releaseWithError = true;
        console.error('Lab cleanup advisory lock release failed:', error);
      }
    }
    client.release(releaseWithError);
  }
}
