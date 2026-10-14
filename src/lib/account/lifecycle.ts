import 'server-only';

import type { Pool } from 'pg';
import { founderEmails } from '@/lib/auth/platform-role';
import { collaborationObjectPrefix } from '@/lib/collab/server';
import { destroyLabVm } from '@/lib/labs/aws-runtime';
import { destroyOperationRun } from '@/lib/operations/runtime';
import { deleteStorageKeys, deleteStoragePrefix } from '@/lib/storage/cleanup';
import { getUserStoragePrefix } from '@/lib/storage/server';
import { storyboardAudioPrefix } from '@/lib/storyboards/audio-storage';

type Queryable = Pick<Pool, 'query'>;

export interface ResourceTerminationSummary {
  operationRuns: number;
  labs: number;
  failures: Array<{ kind: 'operation' | 'lab'; id: string; message: string }>;
}

function isMissingAwsInstance(error: unknown) {
  return typeof error === 'object' && error !== null && 'name' in error &&
    (error as { name?: string }).name === 'InvalidInstanceID.NotFound';
}

async function relationExists(pool: Queryable, relation: string) {
  const result = await pool.query(`SELECT to_regclass($1) AS table_name`, [`public.${relation}`]);
  return Boolean(result.rows[0]?.table_name);
}

/**
 * Destroy one standalone lab VM and record the transition. Labs owned by an
 * operation run are skipped; their run teardown owns the VM lifecycle.
 */
export async function destroyStandaloneLab(pool: Queryable, labId: string) {
  const result = await pool.query(
    `SELECT id, owner_id, status, runtime_provider, runtime_external_id, metadata
       FROM lab_instances WHERE id=$1 LIMIT 1`,
    [labId]
  );
  const lab = result.rows[0];
  if (!lab) return { found: false as const };
  if (lab.status === 'destroyed') return { found: true as const, alreadyDestroyed: true, operationRunId: null };

  const operationRunId = typeof lab.metadata?.operationRunId === 'string' ? lab.metadata.operationRunId as string : null;
  if (operationRunId) return { found: true as const, alreadyDestroyed: false, operationRunId };

  if (lab.runtime_provider === 'aws-ec2' && lab.runtime_external_id) {
    try {
      await destroyLabVm(lab.runtime_external_id);
    } catch (error) {
      if (!isMissingAwsInstance(error)) throw error;
    }
  }

  await pool.query(
    `UPDATE lab_instances
        SET status='destroyed', stopped_at=COALESCE(stopped_at, NOW()), updated_at=NOW()
      WHERE id=$1 AND status <> 'destroyed'`,
    [labId]
  );
  await pool.query(
    `INSERT INTO lab_events (lab_instance_id, event_type, source, payload)
     VALUES ($1, 'admin_destroyed', 'admin', $2::jsonb)`,
    [labId, JSON.stringify({ provider: lab.runtime_provider ?? null, externalId: lab.runtime_external_id ?? null, status: 'destroyed' })]
  ).catch((error) => console.warn('Admin lab destroy event was not recorded:', error));

  return { found: true as const, alreadyDestroyed: false, operationRunId: null };
}

/** Terminate every live cloud resource owned by a user. Continues past individual failures. */
export async function terminateUserCloudResources(pool: Pool, userId: string): Promise<ResourceTerminationSummary> {
  const summary: ResourceTerminationSummary = { operationRuns: 0, labs: 0, failures: [] };

  if (await relationExists(pool, 'operation_runs')) {
    const runs = await pool.query(
      `SELECT id FROM operation_runs WHERE owner_id=$1 AND status NOT IN ('destroyed','failed') ORDER BY created_at ASC`,
      [userId]
    );
    for (const row of runs.rows) {
      try {
        await destroyOperationRun({ pool, runId: row.id, ownerId: userId });
        summary.operationRuns += 1;
      } catch (error) {
        summary.failures.push({ kind: 'operation', id: row.id, message: error instanceof Error ? error.message : 'Teardown failed' });
      }
    }
  }

  const labs = await pool.query(
    `SELECT id FROM lab_instances
      WHERE owner_id=$1 AND status NOT IN ('destroyed','failed')
        AND NOT (COALESCE(metadata, '{}'::jsonb) ? 'operationRunId')`,
    [userId]
  );
  for (const row of labs.rows) {
    try {
      await destroyStandaloneLab(pool, row.id);
      summary.labs += 1;
    } catch (error) {
      summary.failures.push({ kind: 'lab', id: row.id, message: error instanceof Error ? error.message : 'Teardown failed' });
    }
  }

  return summary;
}

/**
 * Permanently remove a user's OXSIG data: cloud resources, object storage and
 * the users row (which cascades to owned relational data). The database row is
 * only deleted after every external cleanup step succeeds so nothing billable
 * or personal is orphaned.
 */
export async function purgeUserAccount(pool: Pool, userId: string) {
  if (await relationExists(pool, 'operation_runs')) {
    const runs = await pool.query(
      `SELECT id FROM operation_runs WHERE owner_id=$1 AND status NOT IN ('destroyed','failed') ORDER BY created_at ASC`,
      [userId]
    );
    for (const row of runs.rows) {
      await destroyOperationRun({ pool, runId: row.id, ownerId: userId });
    }
  }

  // Reuse idempotent teardown so subsequent purge retries do not destroy the VM twice.
  const labs = await pool.query(
    `SELECT id FROM lab_instances
       WHERE owner_id=$1
         AND runtime_provider='aws-ec2'
         AND runtime_external_id IS NOT NULL
         AND status NOT IN ('destroyed','failed')`,
    [userId]
  );
  for (const lab of labs.rows) await destroyStandaloneLab(pool, lab.id);

  // The legacy documents table was retired by migration 045.
  const [ownedCollaborations, storyboardAudio, contributedAttachments] = await Promise.all([
    pool.query(`SELECT id FROM collaborations WHERE owner_id=$1`, [userId]),
    pool.query(`SELECT audio_storage_key FROM storyboard_sessions WHERE owner_id=$1 AND audio_storage_key IS NOT NULL`, [userId]),
    pool.query(
      `SELECT metadata #>> '{attachment,key}' AS object_key
         FROM collaboration_messages
        WHERE user_id=$1 AND metadata ? 'attachment'`,
      [userId]
    ),
  ]);

  await deleteStoragePrefix(getUserStoragePrefix(userId));
  await deleteStoragePrefix(storyboardAudioPrefix(userId));
  for (const collaboration of ownedCollaborations.rows) {
    await deleteStoragePrefix(collaborationObjectPrefix(collaboration.id));
  }
  await deleteStorageKeys([
    ...storyboardAudio.rows.map((row) => row.audio_storage_key as string),
    ...contributedAttachments.rows.map((row) => row.object_key as string).filter(Boolean),
  ]);

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(`DELETE FROM live_workspace_control_leases WHERE granted_by=$1`, [userId]);
    await client.query(`UPDATE collaboration_members SET invited_by=NULL WHERE invited_by=$1`, [userId]);
    const deleted = await client.query(`DELETE FROM users WHERE id=$1 RETURNING id`, [userId]);
    if (!deleted.rows[0]) throw new Error('USER_PURGE_DELETE_MISSED');
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

/** Count active platform admins other than `excludeUserId`, including verified founders. */
export async function countOtherPlatformAdmins(pool: Queryable, excludeUserId: string) {
  const result = await pool.query(
    `SELECT COUNT(*)::int AS count
       FROM users
      WHERE id <> $1
        AND is_active = true
        AND (to_jsonb(users) ->> 'suspended_at') IS NULL
        AND (role = 'admin' OR (email_verified = true AND LOWER(email) = ANY($2::text[])))`,
    [excludeUserId, founderEmails()]
  );
  return Number(result.rows[0]?.count ?? 0);
}
