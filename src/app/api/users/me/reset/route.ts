import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAuth } from '@/lib/auth/middleware';
import { getPool } from '@/lib/db/pool';
import { validateCsrfToken } from '@/lib/security/csrf';
import { checkRateLimit } from '@/lib/security/rate-limit';
import { destroyLabVm } from '@/lib/labs/aws-runtime';
import { destroyOperationRun } from '@/lib/operations/runtime';
import { collaborationObjectPrefix } from '@/lib/collab/server';
import { getUserStoragePrefix } from '@/lib/storage/server';
import { deleteStorageKeys, deleteStoragePrefix } from '@/lib/storage/cleanup';
import { storyboardAudioPrefix } from '@/lib/storyboards/audio-storage';
import { resetEnabled } from '@/lib/account/test-reset-policy';

export const runtime = 'nodejs';

const bodySchema = z.object({ confirmation: z.literal('RESET MY OXSIG DATA') }).strict();

function isMissingAwsInstance(error: unknown) {
  return typeof error === 'object' && error !== null && 'name' in error &&
    (error as { name?: string }).name === 'InvalidInstanceID.NotFound';
}

export async function GET(request: NextRequest) {
  return requireAuth(request, async () => NextResponse.json({ enabled: resetEnabled() }, { headers: { 'Cache-Control': 'no-store' } }));
}

export async function POST(request: NextRequest) {
  return requireAuth(request, async (req, user) => {
    if (!resetEnabled()) return NextResponse.json({ error: 'Test-account reset is disabled on this deployment' }, { status: 403 });
    if (!(await validateCsrfToken(req))) return NextResponse.json({ error: 'Invalid or missing CSRF token' }, { status: 403 });
    const rateLimit = await checkRateLimit(req, { maxRequests: 2, windowMs: 60 * 60_000 }, user.id);
    if (rateLimit) return rateLimit;

    const parsed = bodySchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ error: 'Type RESET MY OXSIG DATA to confirm' }, { status: 400 });

    const pool = getPool();
    const userRow = await pool.query(`SELECT id FROM users WHERE id=$1 AND is_active=true LIMIT 1`, [user.id]);
    if (!userRow.rows[0]) return NextResponse.json({ error: 'User not found' }, { status: 404 });

    try {
      const operationTable = await pool.query(`SELECT to_regclass('public.operation_runs') AS table_name`);
      if (operationTable.rows[0]?.table_name) {
        const runs = await pool.query(
          `SELECT id FROM operation_runs WHERE owner_id=$1 AND status NOT IN ('destroyed','failed') ORDER BY created_at ASC`,
          [user.id]
        );
        for (const row of runs.rows) {
          await destroyOperationRun({ pool, runId: row.id, ownerId: user.id });
        }
      }

      const labs = await pool.query(
        `SELECT id, runtime_external_id, metadata
           FROM lab_instances
          WHERE owner_id=$1
            AND runtime_provider='aws-ec2'
            AND runtime_external_id IS NOT NULL
            AND status NOT IN ('destroyed','failed')`,
        [user.id]
      );
      for (const lab of labs.rows) {
        if (typeof lab.metadata?.operationRunId === 'string') continue;
        try {
          await destroyLabVm(lab.runtime_external_id);
        } catch (error) {
          if (!isMissingAwsInstance(error)) throw error;
        }
        // Record the teardown so a retry after a later failure does not re-run it
        // and the cleanup sweep does not treat the lab as live.
        await pool.query(
          `UPDATE lab_instances SET status='destroyed', updated_at=NOW() WHERE id=$1 AND owner_id=$2`,
          [lab.id, user.id]
        );
      }

      // The legacy `documents` table was retired by migration 045. Querying it
      // made every reset fail with 500 *after* cloud resources were destroyed.
      const [ownedCollaborations, storyboardAudio, contributedAttachments] = await Promise.all([
        pool.query(`SELECT id FROM collaborations WHERE owner_id=$1`, [user.id]),
        pool.query(`SELECT audio_storage_key FROM storyboard_sessions WHERE owner_id=$1 AND audio_storage_key IS NOT NULL`, [user.id]),
        pool.query(
          `SELECT metadata #>> '{attachment,key}' AS object_key
             FROM collaboration_messages
            WHERE user_id=$1 AND metadata ? 'attachment'`,
          [user.id]
        ),
      ]);

      await deleteStoragePrefix(getUserStoragePrefix(user.id));
      await deleteStoragePrefix(storyboardAudioPrefix(user.id));
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
        await client.query(`DELETE FROM live_workspace_control_leases WHERE granted_by=$1`, [user.id]);
        await client.query(`UPDATE collaboration_members SET invited_by=NULL WHERE invited_by=$1`, [user.id]);
        const deleted = await client.query(`DELETE FROM users WHERE id=$1 RETURNING id`, [user.id]);
        if (!deleted.rows[0]) throw new Error('USER_RESET_DELETE_MISSED');
        await client.query('COMMIT');
      } catch (error) {
        await client.query('ROLLBACK').catch(() => undefined);
        throw error;
      } finally {
        client.release();
      }

      return NextResponse.json({ reset: true, signOutRequired: true }, { headers: { 'Cache-Control': 'no-store' } });
    } catch (error) {
      console.error('Test-account reset failed:', error);
      return NextResponse.json({ error: 'Could not reset this test account. No database user deletion was completed unless all external cleanup succeeded.' }, { status: 500 });
    }
  });
}
