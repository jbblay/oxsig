import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAuth } from '@/lib/auth/middleware';
import { getPool } from '@/lib/db/pool';
import { stringifyPostgresJson } from '@/lib/db/postgres-safe';
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
const createSchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('note'), content: z.string().trim().min(1).max(2000) }).strict(),
  z.object({ action: z.literal('checklist'), content: z.string().trim().min(1).max(2000) }).strict(),
  z.object({ action: z.literal('snapshot'), label: z.string().trim().min(1).max(120).optional() }).strict(),
  z.object({ action: z.literal('handoff') }).strict(),
]);

const NO_STORE = { 'Cache-Control': 'no-store' };

function mapItem(row: any) {
  return {
    id: row.id as string,
    kind: row.kind as 'note' | 'checklist' | 'snapshot',
    content: row.content as string,
    metadata: row.metadata || {},
    author: {
      id: row.author_id as string,
      displayName: row.author_name || 'Participant',
      avatarUrl: row.author_avatar_url || null,
    },
    completedAt: row.completed_at || null,
    completedBy: row.completed_by
      ? { id: row.completed_by as string, displayName: row.completed_by_name || 'Participant' }
      : null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapActivity(row: any) {
  return {
    id: row.id as string,
    eventType: row.event_type as string,
    summary: row.summary as string,
    metadata: row.metadata || {},
    actor: row.actor_id
      ? {
          id: row.actor_id as string,
          displayName: row.actor_name || 'Participant',
          avatarUrl: row.actor_avatar_url || null,
        }
      : null,
    createdAt: row.created_at,
  };
}

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return requireAuth(request, async (_req, user) => {
    const { id } = await params;
    if (!idSchema.safeParse(id).success) {
      return NextResponse.json({ error: 'Invalid Live Workspace' }, { status: 400, headers: NO_STORE });
    }

    const pool = getPool();
    try {
      const access = await getLiveWorkspaceAccess(pool, id, user.id);
      if (!access) throw new LiveWorkspaceError('Live Workspace not found or access denied.', 404, 'WORKSPACE_NOT_FOUND');

      const [items, activity] = await Promise.all([
        pool.query(
          `SELECT item.id,
                  item.kind,
                  item.content,
                  item.metadata,
                  item.author_id,
                  item.completed_at,
                  item.completed_by,
                  item.created_at,
                  item.updated_at,
                  COALESCE(author.display_name, split_part(author.email,'@',1), 'Participant') AS author_name,
                  author.avatar_url AS author_avatar_url,
                  COALESCE(completer.display_name, split_part(completer.email,'@',1), 'Participant') AS completed_by_name
             FROM live_workspace_items item
             JOIN users author ON author.id = item.author_id
             LEFT JOIN users completer ON completer.id = item.completed_by
            WHERE item.collaboration_id = $1
              AND item.deleted_at IS NULL
            ORDER BY
              CASE item.kind WHEN 'checklist' THEN 0 WHEN 'note' THEN 1 ELSE 2 END,
              item.created_at DESC
            LIMIT 100`,
          [id]
        ),
        pool.query(
          `SELECT activity.id,
                  activity.event_type,
                  activity.summary,
                  activity.metadata,
                  activity.actor_id,
                  activity.created_at,
                  COALESCE(actor.display_name, split_part(actor.email,'@',1), 'Participant') AS actor_name,
                  actor.avatar_url AS actor_avatar_url
             FROM live_workspace_activity_events activity
             LEFT JOIN users actor ON actor.id = activity.actor_id
            WHERE activity.collaboration_id = $1
            ORDER BY activity.created_at DESC
            LIMIT 50`,
          [id]
        ),
      ]);

      return NextResponse.json({
        viewerId: user.id,
        canWrite: access.capabilities.collaborate,
        canManage: access.isOwner || access.capabilities.manageParticipants,
        canHandoff: access.isOwner,
        items: items.rows.map(mapItem),
        activity: activity.rows.map(mapActivity),
      }, { headers: NO_STORE });
    } catch (error) {
      if (error instanceof LiveWorkspaceError) {
        return NextResponse.json({ error: error.message, code: error.code }, { status: error.status, headers: NO_STORE });
      }
      console.error('Live Workspace coordination load failed:', error);
      return NextResponse.json({ error: 'Could not load workspace coordination' }, { status: 500, headers: NO_STORE });
    }
  });
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return requireAuth(request, async (req, user) => {
    if (!(await validateCsrfToken(req))) {
      return NextResponse.json({ error: 'Invalid or missing CSRF token' }, { status: 403, headers: NO_STORE });
    }

    const { id } = await params;
    if (!idSchema.safeParse(id).success) {
      return NextResponse.json({ error: 'Invalid Live Workspace' }, { status: 400, headers: NO_STORE });
    }
    const rateLimit = await checkRateLimit(req, { maxRequests: 50, windowMs: 60 * 60_000 }, `${user.id}:${id}:coordination`);
    if (rateLimit) return rateLimit;

    const parsed = createSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid workspace coordination action' }, { status: 400, headers: NO_STORE });
    }

    const pool = getPool();
    try {
      const access = await getLiveWorkspaceAccess(pool, id, user.id);
      if (!access) throw new LiveWorkspaceError('Live Workspace not found or access denied.', 404, 'WORKSPACE_NOT_FOUND');
      if (!access.capabilities.collaborate) {
        throw new LiveWorkspaceError('Observers can view workspace coordination but cannot change it.', 403, 'COORDINATION_WRITE_DENIED');
      }

      if (parsed.data.action === 'handoff') {
        if (!access.isOwner) {
          throw new LiveWorkspaceError('Only the workspace owner can hand this workspace into Cyber Room.', 403, 'WARROOM_HANDOFF_DENIED');
        }
        const href = `/warroom?workspace=${encodeURIComponent(id)}`;
        await recordLiveWorkspaceActivity({
          queryable: pool,
          collaborationId: id,
          actorId: user.id,
          eventType: 'warroom.handoff-started',
          summary: 'Prepared Cyber Room handoff',
          metadata: { href },
        });
        await publishCollaborationEvent({
          collaborationId: id,
          name: 'session.changed',
          data: { action: 'live-workspace.coordination-changed', kind: 'handoff' },
        });
        return NextResponse.json({ href }, { headers: NO_STORE });
      }

      const client = await pool.connect();
      try {
        await client.query('BEGIN');

        let kind: 'note' | 'checklist' | 'snapshot';
        let content: string;
        let metadata: Record<string, unknown> = {};
        let eventType: 'note.created' | 'checklist.created' | 'snapshot.created';
        let summary: string;

        if (parsed.data.action === 'snapshot') {
          const resources = await client.query(
            `SELECT resource.id,
                    resource.resource_type,
                    resource.resource_id,
                    resource.resource_owner_id,
                    COALESCE(resource.metadata->>'label', resource.resource_type) AS label,
                    COALESCE(owner.display_name, split_part(owner.email,'@',1), 'Participant') AS owner_name,
                    resource.attached_at
               FROM live_workspace_resources resource
               JOIN users owner ON owner.id = resource.resource_owner_id
              WHERE resource.collaboration_id = $1
                AND resource.status = 'attached'
              ORDER BY resource.attached_at ASC`,
            [id]
          );
          kind = 'snapshot';
          content = parsed.data.label || 'Resource snapshot';
          metadata = {
            resources: resources.rows.map((row) => ({
              bindingId: row.id,
              type: row.resource_type,
              resourceId: row.resource_id,
              resourceOwnerId: row.resource_owner_id,
              ownerName: row.owner_name,
              label: row.label,
              attachedAt: row.attached_at,
            })),
          };
          eventType = 'snapshot.created';
          summary = `Captured resource snapshot (${resources.rowCount || 0} resources)`;
        } else if (parsed.data.action === 'checklist') {
          kind = 'checklist';
          content = parsed.data.content;
          eventType = 'checklist.created';
          summary = liveWorkspaceActivitySummary('Added checklist item', content);
        } else {
          kind = 'note';
          content = parsed.data.content;
          eventType = 'note.created';
          summary = liveWorkspaceActivitySummary('Added note', content);
        }

        const inserted = await client.query(
          `INSERT INTO live_workspace_items (
             collaboration_id, author_id, kind, content, metadata
           ) VALUES ($1,$2,$3,$4,$5::jsonb)
           RETURNING id, kind, content, metadata, author_id, completed_at, completed_by, created_at, updated_at`,
          [id, user.id, kind, content, stringifyPostgresJson(metadata)]
        );

        await recordLiveWorkspaceActivity({
          queryable: client,
          collaborationId: id,
          actorId: user.id,
          eventType,
          summary,
          metadata: { itemId: inserted.rows[0].id, kind },
        });
        await client.query('COMMIT');

        const author = await pool.query(
          `SELECT COALESCE(display_name, split_part(email,'@',1), 'Participant') AS display_name, avatar_url
             FROM users
            WHERE id = $1`,
          [user.id]
        );
        const row = inserted.rows[0];
        const item = mapItem({
          ...row,
          author_name: author.rows[0]?.display_name,
          author_avatar_url: author.rows[0]?.avatar_url,
          completed_by_name: null,
        });

        await publishCollaborationEvent({
          collaborationId: id,
          name: 'session.changed',
          data: { action: 'live-workspace.coordination-changed', kind },
        });
        return NextResponse.json({ item }, { status: 201, headers: NO_STORE });
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
      console.error('Live Workspace coordination update failed:', error);
      return NextResponse.json({ error: 'Could not update workspace coordination' }, { status: 500, headers: NO_STORE });
    }
  });
}
