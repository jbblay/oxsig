import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAuth } from '@/lib/auth/middleware';
import { getPool } from '@/lib/db/pool';
import { deleteCollaborationObjects } from '@/lib/collab/storage';
import { validateCsrfToken } from '@/lib/security/csrf';
import { checkRateLimit } from '@/lib/security/rate-limit';
import { listControlState } from '@/lib/live-workspace/control';
import {
  getLiveWorkspaceAccess,
  listLiveWorkspaceParticipants,
  listOwnerAttachableResources,
} from '@/lib/live-workspace/server';
import { publishCollaborationEvent } from '@/lib/realtime/ably';

export const runtime = 'nodejs';
const idSchema = z.string().uuid();
const updateSchema = z.object({
  name: z.string().trim().min(1).max(80).optional(),
  description: z.string().trim().max(500).nullable().optional(),
  action: z.literal('end').optional(),
}).strict().refine((value) => Object.keys(value).length > 0, 'No Live Workspace changes supplied');

async function hasPersistedAttachments(pool: ReturnType<typeof getPool>, collaborationId: string) {
  const result = await pool.query(
    `SELECT EXISTS (
       SELECT 1
         FROM collaboration_messages
        WHERE collaboration_id = $1
          AND metadata ? 'attachment'
     ) AS has_attachments`,
    [collaborationId]
  );
  return Boolean(result.rows[0]?.has_attachments);
}

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return requireAuth(request, async (_req, user) => {
    const { id } = await params;
    if (!idSchema.safeParse(id).success) return NextResponse.json({ error: 'Invalid Live Workspace' }, { status: 400 });
    const pool = getPool();
    const access = await getLiveWorkspaceAccess(pool, id, user.id);
    if (!access) return NextResponse.json({ error: 'Live Workspace not found or access denied' }, { status: 404 });

    try {
      const attachablePromise = access.capabilities.manageResources
        ? listOwnerAttachableResources(pool, access.ownerId)
        : access.capabilities.collaborate
          ? listOwnerAttachableResources(pool, user.id).then((resources) => resources.filter((resource) => resource.type === 'lab-instance'))
          : Promise.resolve([]);

      const [participants, resources, control, attachableResources, stageSetting] = await Promise.all([
        listLiveWorkspaceParticipants(pool, id),
        pool.query(
          `SELECT resource.id, resource.resource_type, resource.resource_id, resource.resource_owner_id,
                  resource.attached_by, resource.metadata, resource.attached_at,
                  COALESCE(owner.display_name, split_part(owner.email,'@',1), 'Participant') AS resource_owner_name,
                  CASE
                    WHEN resource.resource_type = 'lab-instance' AND lab.metadata->>'accessMode' = 'desktop' THEN 'desktop'
                    WHEN resource.resource_type = 'lab-instance' THEN 'terminal'
                    ELSE NULL
                  END AS access_mode
           FROM live_workspace_resources resource
           LEFT JOIN lab_instances lab
             ON resource.resource_type = 'lab-instance' AND lab.id = resource.resource_id
           JOIN users owner ON owner.id = resource.resource_owner_id
           WHERE resource.collaboration_id = $1 AND resource.status = 'attached'
           ORDER BY resource.attached_at ASC`,
          [id]
        ),
        listControlState({ pool, collaborationId: id, viewerId: user.id }),
        attachablePromise,
        pool.query("SELECT settings->'liveWorkspaceStage' AS stage FROM collaborations WHERE id = $1", [id]),
      ]);
      const attachedKeys = new Set(resources.rows.map((row) => `${row.resource_type}:${row.resource_id}`));
      const saved = stageSetting.rows[0]?.stage;
      const matchesSaved = resources.rows.some((row) => row.id === saved?.bindingId && row.resource_type === (saved.surface === 'board' ? 'storyboard' : 'lab-instance') && (saved.surface === 'board' || saved.surface === 'machine'));
      const defaultResource = resources.rows.find((row) => row.resource_type === 'storyboard' || row.resource_type === 'lab-instance');
      const stage = matchesSaved
        ? { surface: saved.surface as 'board' | 'machine', bindingId: saved.bindingId as string }
        : defaultResource
          ? { surface: (defaultResource.resource_type === 'storyboard' ? 'board' : 'machine') as 'board' | 'machine', bindingId: defaultResource.id as string }
          : null;

      return NextResponse.json({
        viewerId: user.id,
        workspace: access,
        stage,
        participants,
        resources: resources.rows.map((row) => ({
          id: row.id,
          type: row.resource_type,
          resourceId: row.resource_id,
          resourceOwnerId: row.resource_owner_id,
          resourceOwnerName: row.resource_owner_name,
          attachedBy: row.attached_by,
          label: row.metadata?.label || row.resource_type,
          attachedAt: row.attached_at,
          accessMode: row.access_mode || null,
          ownershipTransferred: false,
        })),
        attachableResources: attachableResources.map((resource) => ({
          ...resource,
          attached: attachedKeys.has(`${resource.type}:${resource.id}`),
        })),
        control: {
          ...control,
          note: 'Machine input requires an active server-validated control lease. Workspace membership or resource visibility alone never grants control.',
        },
      }, { headers: { 'Cache-Control': 'no-store' } });
    } catch (error) {
      console.error('Live Workspace detail failed:', error);
      return NextResponse.json({ error: 'Could not load Live Workspace' }, { status: 500 });
    }
  });
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return requireAuth(request, async (req, user) => {
    if (!(await validateCsrfToken(req))) {
      return NextResponse.json({ error: 'Invalid or missing CSRF token' }, { status: 403 });
    }
    const rateLimit = await checkRateLimit(req, { maxRequests: 20, windowMs: 60_000 }, user.id);
    if (rateLimit) return rateLimit;

    const { id } = await params;
    if (!idSchema.safeParse(id).success) return NextResponse.json({ error: 'Invalid Live Workspace' }, { status: 400 });
    const parsed = updateSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ error: 'Invalid Live Workspace update' }, { status: 400 });

    const pool = getPool();
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const owned = await client.query(
        `SELECT c.id, c.name, c.description, c.owner_id, c.status AS collaboration_status,
                lw.status AS workspace_status
           FROM collaborations c
           JOIN live_workspaces lw ON lw.collaboration_id = c.id
          WHERE c.id = $1 AND c.owner_id = $2 AND c.collaboration_type = 'live-workspace'
          FOR UPDATE`,
        [id, user.id]
      );
      if (!owned.rows[0]) {
        await client.query('ROLLBACK');
        return NextResponse.json({ error: 'Live Workspace not found or owner access required' }, { status: 404 });
      }

      const patch = parsed.data;
      if (patch.action === 'end') {
        await client.query(
          `UPDATE live_workspace_control_requests
              SET status = 'cancelled', decided_at = NOW(), decided_by = $2, updated_at = NOW()
            WHERE collaboration_id = $1 AND status = 'pending'`,
          [id, user.id]
        );
        await client.query(
          `UPDATE live_workspace_control_leases
              SET status = 'revoked', revoked_at = NOW(), revoked_by = $2,
                  revocation_reason = 'workspace-ended', updated_at = NOW()
            WHERE collaboration_id = $1 AND status = 'active'`,
          [id, user.id]
        );
        await client.query(
          `UPDATE live_workspaces
              SET status = 'ended', ended_at = COALESCE(ended_at, NOW()), updated_at = NOW()
            WHERE collaboration_id = $1`,
          [id]
        );
      }

      const finalStatus = patch.action === 'end' ? 'ended' : owned.rows[0].collaboration_status;
      const updated = await client.query(
        `UPDATE collaborations
            SET name = COALESCE($3, name),
                description = CASE WHEN $4::boolean THEN $5 ELSE description END,
                status = $6,
                updated_at = NOW()
          WHERE id = $1 AND owner_id = $2
          RETURNING id, name, description, owner_id, status, created_at, updated_at`,
        [
          id,
          user.id,
          patch.name ?? null,
          Object.hasOwn(patch, 'description'),
          patch.description ?? null,
          finalStatus,
        ]
      );
      await client.query('COMMIT');
      await publishCollaborationEvent({
        collaborationId: id,
        name: 'session.changed',
        data: { action: patch.action === 'end' ? 'live-workspace.ended' : 'live-workspace.updated' },
      });
      const row = updated.rows[0];
      return NextResponse.json({
        workspace: {
          id: row.id,
          name: row.name,
          description: row.description || '',
          ownerId: row.owner_id,
          status: patch.action === 'end' ? 'ended' : owned.rows[0].workspace_status,
          isOwner: true,
          createdAt: row.created_at,
          updatedAt: row.updated_at,
        },
      });
    } catch (error) {
      await client.query('ROLLBACK').catch(() => undefined);
      console.error('Live Workspace update failed:', error);
      return NextResponse.json({ error: 'Could not update Live Workspace' }, { status: 500 });
    } finally {
      client.release();
    }
  });
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return requireAuth(request, async (req, user) => {
    if (!(await validateCsrfToken(req))) {
      return NextResponse.json({ error: 'Invalid or missing CSRF token' }, { status: 403 });
    }
    const rateLimit = await checkRateLimit(req, { maxRequests: 8, windowMs: 60_000 }, user.id);
    if (rateLimit) return rateLimit;

    const { id } = await params;
    if (!idSchema.safeParse(id).success) return NextResponse.json({ error: 'Invalid Live Workspace' }, { status: 400 });

    const pool = getPool();
    const owned = await pool.query(
      `SELECT id
         FROM collaborations
        WHERE id = $1 AND owner_id = $2 AND collaboration_type = 'live-workspace'
        LIMIT 1`,
      [id, user.id]
    );
    if (!owned.rows[0]) {
      return NextResponse.json({ error: 'Live Workspace not found or owner access required' }, { status: 404 });
    }

    let attachmentCleanupDeferred = false;
    try {
      await deleteCollaborationObjects(id);
    } catch (error) {
      const persistedAttachments = await hasPersistedAttachments(pool, id).catch(() => true);
      if (persistedAttachments) {
        console.warn('Live Workspace attachment cleanup failed; database deletion was not attempted:', error);
        return NextResponse.json(
          { error: 'Could not delete Live Workspace attachments. Nothing was deleted.' },
          { status: 503 }
        );
      }
      attachmentCleanupDeferred = true;
      console.warn('Live Workspace storage cleanup was unavailable, but no persisted attachment references exist; continuing relational deletion:', error);
    }

    const result = await pool.query(
      `DELETE FROM collaborations
        WHERE id = $1 AND owner_id = $2 AND collaboration_type = 'live-workspace'
        RETURNING id`,
      [id, user.id]
    );
    if (!result.rows[0]) {
      return NextResponse.json({ error: 'Live Workspace changed before deletion; try again' }, { status: 409 });
    }

    await publishCollaborationEvent({
      collaborationId: id,
      name: 'session.changed',
      data: { action: 'live-workspace.deleted' },
    });
    return NextResponse.json({ deleted: true, ...(attachmentCleanupDeferred ? { attachmentCleanupDeferred: true } : {}) });
  });
}
