import { timingSafeEqual } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { getPool } from '@/lib/db/pool';
import {
  describeLabVmStates,
  destroyLabVm,
  listExpiredTaggedLabVms,
} from '@/lib/labs/aws-runtime';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const CLEANUP_LOCK_NAMESPACE = 'oxsig';
const CLEANUP_LOCK_NAME = 'labs-expiry-cleanup';

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

export async function GET(request: NextRequest) {
  if (!process.env.CRON_SECRET) {
    return NextResponse.json({ error: 'CRON_SECRET is not configured' }, { status: 503 });
  }
  if (!isAuthorizedCron(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Scheduling may be enabled before AWS labs are activated. Keep the cron
  // endpoint configuration-safe instead of attempting AWS calls with a disabled
  // runtime.
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

    const [dbExpired, awsExpired] = await Promise.all([
      client.query(
        `SELECT id::text AS id, runtime_external_id
         FROM lab_instances
         WHERE runtime_provider='aws-ec2'
           AND expires_at IS NOT NULL
           AND expires_at <= NOW()
           AND status NOT IN ('destroyed','failed')
         ORDER BY expires_at ASC`
      ),
      listExpiredTaggedLabVms(now),
    ]);

    const candidates = new Map<string, { externalId: string; labInstanceId?: string }>();
    for (const row of dbExpired.rows) {
      if (row.runtime_external_id) {
        candidates.set(row.runtime_external_id, {
          externalId: row.runtime_external_id,
          labInstanceId: row.id,
        });
      }
    }
    for (const item of awsExpired) {
      const existing = candidates.get(item.externalId);
      candidates.set(item.externalId, {
        externalId: item.externalId,
        labInstanceId: existing?.labInstanceId || item.labInstanceId,
      });
    }

    let terminationAccepted = 0;
    let destroyedConfirmed = 0;
    let alreadyGone = 0;
    let labsReconciled = 0;
    let eventsWritten = 0;
    const failures: Array<{ externalId: string; error: string }> = [];

    for (const candidate of candidates.values()) {
      try {
        await destroyLabVm(candidate.externalId);
        terminationAccepted += 1;

        const states = await describeLabVmStates([candidate.externalId]);
        const status = states.get(candidate.externalId) === 'destroyed' ? 'destroyed' : 'destroying';
        if (status === 'destroyed') destroyedConfirmed += 1;

        const updated = await client.query(
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
        labsReconciled += updated.rowCount || 0;

        for (const row of updated.rows) {
          await client.query(
            `INSERT INTO lab_events (lab_instance_id,event_type,source,payload)
             VALUES ($1,'expired_cleanup','scheduler',$2)`,
            [row.id, JSON.stringify({
              provider: 'aws-ec2',
              externalId: candidate.externalId,
              status,
            })]
          );
          eventsWritten += 1;
        }
      } catch (error) {
        if (isMissingInstance(error)) {
          alreadyGone += 1;
          const updated = await client.query(
            `UPDATE lab_instances
             SET status='destroyed', last_error=NULL, updated_at=NOW()
             WHERE (runtime_external_id=$1 OR id::text=$2)
               AND status NOT IN ('destroyed','failed')
             RETURNING id`,
            [candidate.externalId, candidate.labInstanceId || '']
          );
          labsReconciled += updated.rowCount || 0;
          for (const row of updated.rows) {
            await client.query(
             `INSERT INTO lab_events (lab_instance_id,event_type,source,payload)
              VALUES ($1,'expired_cleanup_missing_instance','scheduler',$2)`,
             [row.id, JSON.stringify({
               provider: 'aws-ec2',
               externalId: candidate.externalId,
               status: 'destroyed',
               reason: 'missing_instance',
             })]
            );
            eventsWritten += 1;
          }
          continue;
        }

        const message = error instanceof Error ? error.message.slice(0, 500) : 'AWS termination failed';
        failures.push({ externalId: candidate.externalId, error: message });
        await client.query(
          `UPDATE lab_instances
           SET last_error=$1, updated_at=NOW()
           WHERE (runtime_external_id=$2 OR id::text=$3)
             AND status NOT IN ('destroyed','failed')`,
          [message, candidate.externalId, candidate.labInstanceId || '']
        );
      }
    }

    // Release allocations that expired before an AWS instance identifier was
    // recorded, but only after the tag scan above had a chance to recover any
    // orphaned EC2 instance via its LabInstanceId tag.
    const taggedLabIds = new Set(awsExpired.map((item) => item.labInstanceId).filter(Boolean));
    let expiredWithoutRuntime = 0;
    for (const row of dbExpired.rows) {
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
         [updated.id, JSON.stringify({
           provider: 'aws-ec2',
           status: 'failed',
           reason: 'runtime_external_id_missing',
         })]
        );
        eventsWritten += 1;
      }
    }

    return NextResponse.json({
      ok: failures.length === 0,
      checkedAt: now.toISOString(),
      databaseExpired: dbExpired.rowCount || 0,
      awsTaggedExpired: awsExpired.length,
      terminationAccepted,
      destroyedConfirmed,
      alreadyGone,
      candidateCount: candidates.size,
      labsReconciled,
      eventsWritten,
      expiredWithoutRuntime,
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
