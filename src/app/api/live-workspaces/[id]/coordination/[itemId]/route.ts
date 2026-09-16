import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAuth } from '@/lib/auth/middleware';
import { getPool } from '@/lib/db/pool';
import {
  liveWorkspaceActivitySummary,
  recordLiveWorkspaceActivity,
} from '@/lib/live-workspace/coordination';
import { getLiveWorkspaceAccess, LiveWorkspaceError } from '@/lib/live-workspace/server';
import { publishCollaborationEvent } from '@/lib/realtime/ably';
import { validateCsrfToken } from '@/lib/security/csrf';
import { checkRateLimit } from '@/lib/security/rate-limit';

export const runtime = 'nodejs';

const idSchema = z.string().uuid();
const patchSchema = z.object({
  content: z.string().trim().min(1).max(2000).optional(),
  completed: z.boolean().optional(),
}).strict().refine((value) => value.content !== undefined || value.completed !== undefined, 'No changes supplied');
const NO_STORE = { 'Cache-Control': 'no-store' };

async function loadItemForUpdate(client: any, collaborationId: string, itemId: string) {
  const result = await client.query(
    `SELECT id, author_id, kind, content, completed_at, completed_by
       FROM live_workspace_items
      WHERE id = $1
        AND collaboration_id = $2
        AND deleted_at IS NULL
      FOR UPDATE`,
    [itemId, collaborationId]
  );
  return result.rows[0] || null;
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; itemId: string }> }
) {
  return requireAuth(request, async (req, user) => {
    if (!(await validateCsrfToken(req))) {
      return NextResponse.json({ error: 'Invalid or missing CSRF token' }, { status: 403, headers: NO_STORE });
    }
    const { id, itemId } = await params;
    if (!idSchema.safeParse(id).success || !idSchema.safeParse(itemId).success) {
      return NextResponse.json({ error: 'Invalid workspace item' }, { status: 400, headers: NO_STORE });
    }
    const parsed = patchSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid workspace item update' }, { status: 400, headers: NO_STORE });
    }
    const rateLimit = await checkRateLimit(req, { maxRequests: 80, windowMs: 60 * 60_000 }, `${user.id}:${id}:coordination-item`);
    if (rateLimit) return rateLimit;

    const pool = getPool();
    try {
      const access = await getLiveWorkspaceAccess(pool, id, user.id);
      if (!access) throw new LiveWorkspaceError('Live Workspace not found or access denied.', 404, 'WORKSPACE_NOT_FOUND');
      if (!access.capabilities.collaborate) {
        throw new LiveWorkspaceError('Observers can view workspace coordination but cannot change it.', 403, 'COORDINATION_WRITE_DENIED');
      }

      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        const item = await loadItemForUpdate(client, id, itemId);
        if (!item) throw new LiveWorkspaceError('Workspace item not found.', 404, 'COORDINATION_ITEM_NOT_FOUND');

        const canManage = access.isOwner || access.capabilities.manageParticipants;
        if (parsed.data.content !== undefined && item.author_id !== user.id && !canManage) {
          throw new LiveWorkspaceError('Only the author or a workspace manager can edit this item.', 403, 'COORDINATION_EDIT_DENIED');
        }
        if (parsed.data.completed !== undefined && item.kind !== 'checklist') {
          throw new LiveWorkspaceError('Only checklist items can be completed.', 409, 'COORDINATION_NOT_CHECKLIST');
        }

        const nextContent = parsed.data.content ?? item.content;
        const shouldComplete = parsed.data.completed;
        const result = await client.query(
          `UPDATE live_workspace_items
              SET content = $3,
                  completed_at = CASE
                    WHEN $4::boolean IS NULL THEN completed_at
                    WHEN $4::boolean THEN COALESCE(completed_at, NOW())
                    ELSE NULL
                  END,
                  completed_by = CASE
                    WHEN $4::boolean IS NULL THEN completed_by
                    WHEN $4::boolean THEN $5::uuid
                    ELSE NULL
                  END,
                  updated_at = NOW()
            WHERE id = $1 AND collaboration_id = $2 AND deleted_at IS NULL
            RETURNING id, kind, content, metadata, author_id, completed_at, completed_by, created_at, updated_at`,
          [itemId, id, nextContent, shouldComplete ?? null, user.id]
        );

        if (shouldComplete !== undefined) {
          await recordLiveWorkspaceActivity({
            queryable: client,
            collaborationId: id,
            actorId: user.id,
            eventType: shouldComplete ? 'checklist.completed' : 'checklist.reopened',
            summary: liveWorkspaceActivitySummary(shouldComplete ? 'Completed checklist item' : 'Reopened checklist item', nextContent),
            metadata: { itemId },
          });
        } else if (parsed.data.content !== undefined) {
          await recordLiveWorkspaceActivity({
            queryable: client,
            collaborationId: id,
            actorId: user.id,
            eventType: 'note.updated',
            summary: liveWorkspaceActivitySummary(item.kind === 'checklist' ? 'Updated checklist item' : 'Updated note', nextContent),
            metadata: { itemId, kind: item.kind },
          });
        }

        await client.query('COMMIT');
        await publishCollaborationEvent({
          collaborationId: id,
          name: 'session.changed',
          data: { action: 'live-workspace.coordination-changed', itemId },
        });
        return NextResponse.json({ item: result.rows[0] }, { headers: NO_STORE });
      } catch (error) {
        await client.query('ROLLBACK').catch(() => undefined);
        throw error;
      } finally {
        client.release();
      }
    } catch (error) {
      if (error instanceof LiveWorkspaceError) {
        return NextResponse.json({ error: error.message, code: error.code }, { status: error.status, headers: NO_STORE });
      }
      console.error('Live Workspace coordination item update failed:', error);
      return NextResponse.json({ error: 'Could not update workspace item' }, { status: 500, headers: NO_STORE });
    }
  });
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; itemId: string }> }
) {
  return requireAuth(request, async (req, user) => {
    if (!(await validateCsrfToken(req))) {
      return NextResponse.json({ error: 'Invalid or missing CSRF token' }, { status: 403, headers: NO_STORE });
    }
    const { id, itemId } = await params;
    if (!idSchema.safeParse(id).success || !idSchema.safeParse(itemId).success) {
      return NextResponse.json({ error: 'Invalid workspace item' }, { status: 400, headers: NO_STORE });
    }
    const rateLimit = await checkRateLimit(req, { maxRequests: 40, windowMs: 60 * 60_000 }, `${user.id}:${id}:coordination-item-delete`);
    if (rateLimit) return rateLimit;

    const pool = getPool();
    try {
      const access = await getLiveWorkspaceAccess(pool, id, user.id);
      if (!access) throw new LiveWorkspaceError('Live Workspace not found or access denied.', 404, 'WORKSPACE_NOT_FOUND');
      if (!access.capabilities.collaborate) {
        throw new LiveWorkspaceError('Observers can view workspace coordination but cannot change it.', 403, 'COORDINATION_WRITE_DENIED');
      }

      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        const item = await loadItemForUpdate(client, id, itemId);
        if (!item) throw new LiveWorkspaceError('Workspace item not found.', 404, 'COORDINATION_ITEM_NOT_FOUND');
        const canManage = access.isOwner || access.capabilities.manageParticipants;
        if (item.author_id !== user.id && !canManage) {
          throw new LiveWorkspaceError('Only the author or a workspace manager can delete this item.', 403, 'COORDINATION_DELETE_DENIED');
        }

        await client.query(
          `UPDATE live_workspace_items
              SET deleted_at = NOW(), updated_at = NOW()
            WHERE id = $1 AND collaboration_id = $2 AND deleted_at IS NULL`,
          [itemId, id]
        );
        await recordLiveWorkspaceActivity({
          queryable: client,
          collaborationId: id,
          actorId: user.id,
          eventType: 'item.deleted',
          summary: liveWorkspaceActivitySummary(`Removed ${item.kind === 'checklist' ? 'checklist item' : item.kind}`, item.content),
          metadata: { itemId, kind: item.kind },
        });
        await client.query('COMMIT');

        await publishCollaborationEvent({
          collaborationId: id,
          name: 'session.changed',
          data: { action: 'live-workspace.coordination-changed', itemId, deleted: true },
        });
        return NextResponse.json({ deleted: true, itemId }, { headers: NO_STORE });
      } catch (error) {
        await client.query('ROLLBACK').catch(() => undefined);
        throw error;
      } finally {
        client.release();
      }
    } catch (error) {
      if (error instanceof LiveWorkspaceError) {
        return NextResponse.json({ error: error.message, code: error.code }, { status: error.status, headers: NO_STORE });
      }
      console.error('Live Workspace coordination item delete failed:', error);
      return NextResponse.json({ error: 'Could not delete workspace item' }, { status: 500, headers: NO_STORE });
    }
  });
}
