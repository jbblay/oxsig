import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAuth } from '@/lib/auth/middleware';
import { getPool } from '@/lib/db/pool';
import { getCollaborationAccess } from '@/lib/collab/server';
import { publishCollaborationEvent } from '@/lib/realtime/ably';
import { validateCsrfToken } from '@/lib/security/csrf';
import { checkRateLimit } from '@/lib/security/rate-limit';
import { revokeControlForParticipant } from '@/lib/live-workspace/control';

export const runtime = 'nodejs';
const idSchema = z.string().uuid();

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; userId: string }> }
) {
  return requireAuth(request, async (req, user) => {
    if (!(await validateCsrfToken(req))) {
      return NextResponse.json({ error: 'Invalid or missing CSRF token' }, { status: 403 });
    }
    const { id, userId } = await params;
    if (!idSchema.safeParse(id).success || !idSchema.safeParse(userId).success) {
      return NextResponse.json({ error: 'Invalid collaboration member' }, { status: 400 });
    }
    const rateLimit = await checkRateLimit(req, { maxRequests: 30, windowMs: 60 * 60_000 }, `${user.id}:${id}`);
    if (rateLimit) return rateLimit;

    const pool = getPool();
    const access = await getCollaborationAccess(pool, id, user.id);
    if (!access) {
      return NextResponse.json({ error: 'Collaboration not found or access denied' }, { status: 404 });
    }
    if (userId === access.ownerId) {
      return NextResponse.json({ error: 'The collaboration owner cannot be removed' }, { status: 409 });
    }
    const removingSelf = user.id === userId;
    if (!removingSelf && !access.isOwner && access.role !== 'admin') {
      return NextResponse.json({ error: 'Only owners and admins can remove another member' }, { status: 403 });
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const removed = await client.query(
        `UPDATE collaboration_members
            SET status = 'removed', last_active_at = NOW()
          WHERE collaboration_id = $1 AND user_id = $2 AND status = 'active'
          RETURNING user_id`,
        [id, userId]
      );
      if (!removed.rows[0]) {
        await client.query('ROLLBACK');
        return NextResponse.json({ error: 'Collaboration member not found' }, { status: 404 });
      }

      const liveWorkspace = await client.query(
        `SELECT 1 FROM live_workspaces WHERE collaboration_id = $1 LIMIT 1`,
        [id]
      );
      if (liveWorkspace.rowCount) {
        await revokeControlForParticipant({
          queryable: client,
          collaborationId: id,
          participantId: userId,
          actorId: user.id,
          reason: removingSelf ? 'participant_left' : 'participant_removed',
        });
        await client.query(
          `UPDATE live_workspace_participants
              SET status = 'removed', updated_at = NOW()
            WHERE collaboration_id = $1 AND user_id = $2`,
          [id, userId]
        );
      }

      await client.query(`UPDATE collaborations SET updated_at = NOW() WHERE id = $1`, [id]);
      await client.query('COMMIT');

      await publishCollaborationEvent({
        collaborationId: id,
        name: 'members.changed',
        data: { memberId: userId, action: removingSelf ? 'left' : 'removed' },
      }).catch(() => undefined);

      return NextResponse.json({ removed: true, left: removingSelf });
    } catch (error) {
      await client.query('ROLLBACK').catch(() => undefined);
      console.error('Collaboration member removal failed:', error);
      return NextResponse.json({ error: 'Could not remove collaboration member' }, { status: 500 });
    } finally {
      client.release();
    }
  });
}
