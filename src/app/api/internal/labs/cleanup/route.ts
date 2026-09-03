import { timingSafeEqual } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { getPool } from '@/lib/db/pool';
import { destroyLabVm, listExpiredTaggedLabVms } from '@/lib/labs/aws-runtime';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

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

  const pool = getPool();
  const now = new Date();

  const [dbExpired, awsExpired] = await Promise.all([
    pool.query(
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
  let alreadyGone = 0;
  const failures: Array<{ externalId: string; error: string }> = [];

  for (const candidate of candidates.values()) {
    try {
      await destroyLabVm(candidate.externalId);
      terminationAccepted += 1;

      const updated = await pool.query(
        `UPDATE lab_instances
         SET status='destroying',
             runtime_external_id=COALESCE(runtime_external_id,$1),
             last_error=NULL,
             updated_at=NOW()
         WHERE (runtime_external_id=$1 OR id::text=$2)
           AND status NOT IN ('destroyed','failed')
         RETURNING id`,
        [candidate.externalId, candidate.labInstanceId || '']
      );

      for (const row of updated.rows) {
        await pool.query(
          `INSERT INTO lab_events (lab_instance_id,event_type,source,payload)
           VALUES ($1,'expired_cleanup','scheduler',$2)`,
          [row.id, JSON.stringify({ provider: 'aws-ec2', externalId: candidate.externalId })]
        );
      }
    } catch (error) {
      if (isMissingInstance(error)) {
        alreadyGone += 1;
        await pool.query(
          `UPDATE lab_instances
           SET status='destroyed', last_error=NULL, updated_at=NOW()
           WHERE (runtime_external_id=$1 OR id::text=$2)
             AND status NOT IN ('destroyed','failed')`,
          [candidate.externalId, candidate.labInstanceId || '']
        );
        continue;
      }

      const message = error instanceof Error ? error.message.slice(0, 500) : 'AWS termination failed';
      failures.push({ externalId: candidate.externalId, error: message });
      await pool.query(
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
    const result = await pool.query(
      `UPDATE lab_instances
       SET status='failed',
           last_error='Expired before an AWS runtime identifier was recorded; scheduled cleanup found no tagged EC2 instance.',
           updated_at=NOW()
       WHERE id::text=$1
         AND runtime_external_id IS NULL
         AND status NOT IN ('destroyed','failed')`,
      [row.id]
    );
    expiredWithoutRuntime += result.rowCount || 0;
  }

  return NextResponse.json({
    ok: failures.length === 0,
    checkedAt: now.toISOString(),
    databaseExpired: dbExpired.rowCount || 0,
    awsTaggedExpired: awsExpired.length,
    terminationAccepted,
    alreadyGone,
    expiredWithoutRuntime,
    failures,
  }, { status: failures.length === 0 ? 200 : 207 });
}
