import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAuth } from '@/lib/auth/middleware';
import { getPool } from '@/lib/db/pool';
import { validateCsrfToken } from '@/lib/security/csrf';
import { checkRateLimit } from '@/lib/security/rate-limit';
import { revokeControlForBinding, revokeControlForParticipant } from '@/lib/live-workspace/control';
import { assignLiveWorkspaceRole, LiveWorkspaceError } from '@/lib/live-workspace/server';
import { publishCollaborationEvent } from '@/lib/realtime/ably';

export const runtime = 'nodejs';
const idSchema = z.string().uuid();
const bodySchema = z.object({ role: z.enum(['instructor', 'learner', 'observer']) }).strict();

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; userId: string }> }
) {
  return requireAuth(request, async (req, user) => {
    if (!(await validateCsrfToken(req))) return NextResponse.json({ error: 'Invalid or missing CSRF token' }, { status: 403 });
    const { id, userId } = await params;
    if (!idSchema.safeParse(id).success || !idSchema.safeParse(userId).success) {
      return NextResponse.json({ error: 'Invalid Live Workspace participant' }, { status: 400 });
    }
    const rateLimit = await checkRateLimit(req, { maxRequests: 30, windowMs: 60 * 60_000 }, `${user.id}:${id}`);
    if (rateLimit) return rateLimit;
    const parsed = bodySchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ error: 'Choose instructor, learner, or observer' }, { status: 400 });

    try {
      const pool = getPool();
      const assigned = await assignLiveWorkspaceRole({
        pool,
        collaborationId: id,
        actorId: user.id,
        targetUserId: userId,
        role: parsed.data.role,
      });

      let detachedResources = 0;
      if (parsed.data.role === 'observer') {
        const client = await pool.connect();
        try {
          await client.query('BEGIN');
          const detached = await client.query(
            `UPDATE live_workspace_resources
                SET status='detached', detached_at=NOW(), updated_at=NOW()
              WHERE collaboration_id=$1
                AND resource_owner_id=$2
                AND status='attached'
              RETURNING id`,
            [id, userId]
          );
          for (const row of detached.rows) {
            await revokeControlForBinding({
              queryable: client,
              collaborationId: id,
              bindingId: row.id,
              actorId: user.id,
              reason: 'role_became_observer',
            });
          }
          await revokeControlForParticipant({
            queryable: client,
            collaborationId: id,
            participantId: userId,
            actorId: user.id,
            reason: 'role_became_observer',
          });
          await client.query('COMMIT');
          detachedResources = detached.rowCount || 0;
        } catch (error) {
          await client.query('ROLLBACK').catch(() => undefined);
          throw error;
        } finally {
          client.release();
        }
      }
      await publishCollaborationEvent({
        collaborationId: id,
        name: 'members.changed',
        data: { memberId: userId, action: 'live-workspace.role-changed', role: parsed.data.role },
      });
      return NextResponse.json({ participant: { userId, ...assigned }, detachedResources }, { headers: { 'Cache-Control': 'no-store' } });
    } catch (error) {
      if (error instanceof LiveWorkspaceError) {
        return NextResponse.json({ error: error.message, code: error.code }, { status: error.status, headers: { 'Cache-Control': 'no-store' } });
      }
      console.error('Live Workspace role update failed:', error);
      return NextResponse.json({ error: 'Could not update participant role' }, { status: 500 });
    }
  });
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; userId: string }> }
) {
  return requireAuth(request, async (req, user) => {
    if (!(await validateCsrfToken(req))) return NextResponse.json({ error: 'Invalid or missing CSRF token' }, { status: 403 });
    const { id, userId } = await params;
    if (!idSchema.safeParse(id).success || !idSchema.safeParse(userId).success) {
      return NextResponse.json({ error: 'Invalid Live Workspace participant' }, { status: 400 });
    }
    const rateLimit = await checkRateLimit(req, { maxRequests: 20, windowMs: 60 * 60_000 }, `${user.id}:${id}`);
    if (rateLimit) return rateLimit;

    const pool = getPool();
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const workspace = await client.query(
        `SELECT c.owner_id
           FROM collaborations c
           JOIN live_workspaces lw ON lw.collaboration_id = c.id
          WHERE c.id = $1
            AND c.collaboration_type = 'live-workspace'
            AND c.status = 'active'
            AND lw.status = 'active'
          FOR UPDATE`,
        [id]
      );
      const ownerId = workspace.rows[0]?.owner_id as string | undefined;
      if (!ownerId) {
        await client.query('ROLLBACK');
        return NextResponse.json({ error: 'Live Workspace not found' }, { status: 404 });
      }
      if (userId === ownerId) {
        await client.query('ROLLBACK');
        return NextResponse.json({ error: 'The workspace owner cannot be removed' }, { status: 409 });
      }
      if (user.id !== ownerId && user.id !== userId) {
        await client.query('ROLLBACK');
        return NextResponse.json({ error: 'Only the workspace owner can remove another participant' }, { status: 403 });
      }

      const member = await client.query(
        `SELECT 1
           FROM collaboration_members
          WHERE collaboration_id = $1 AND user_id = $2 AND status = 'active'
          LIMIT 1
          FOR UPDATE`,
        [id, userId]
      );
      if (!member.rowCount) {
        await client.query('ROLLBACK');
        return NextResponse.json({ error: 'Participant not found' }, { status: 404 });
      }

      const reason = user.id === userId ? 'participant_left' : 'participant_removed';

      // A contributed lab is participant-owned. Once that participant leaves,
      // detach every owned binding in the same transaction and revoke control
      // held by any controller against those bindings before membership commits.
      const detached = await client.query(
        `UPDATE live_workspace_resources
            SET status='detached', detached_at=NOW(), updated_at=NOW()
          WHERE collaboration_id=$1
            AND resource_owner_id=$2
            AND status='attached'
          RETURNING id`,
        [id, userId]
      );
      for (const row of detached.rows) {
        await revokeControlForBinding({
          queryable: client,
          collaborationId: id,
          bindingId: row.id,
          actorId: user.id,
          reason,
        });
      }

      await revokeControlForParticipant({
        queryable: client,
        collaborationId: id,
        participantId: userId,
        actorId: user.id,
        reason,
      });
      await client.query(
        `UPDATE live_workspace_participants
            SET status = 'removed', updated_at = NOW()
          WHERE collaboration_id = $1 AND user_id = $2`,
        [id, userId]
      );
      await client.query(
        `UPDATE collaboration_members
            SET status = 'removed', last_active_at = NOW()
          WHERE collaboration_id = $1 AND user_id = $2`,
        [id, userId]
      );
      await client.query('COMMIT');
      await publishCollaborationEvent({
        collaborationId: id,
        name: 'members.changed',
        data: { memberId: userId, action: user.id === userId ? 'left' : 'removed' },
      });
      return NextResponse.json({ removed: true, left: user.id === userId, detachedResources: detached.rowCount || 0 });
    } catch (error) {
      await client.query('ROLLBACK').catch(() => undefined);
      console.error('Live Workspace participant removal failed:', error);
      return NextResponse.json({ error: 'Could not remove participant' }, { status: 500 });
    } finally {
      client.release();
    }
  });
}
