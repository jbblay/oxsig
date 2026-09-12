import { stringifyPostgresJson } from '@/lib/db/postgres-safe';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAuth } from '@/lib/auth/middleware';
import { getPool } from '@/lib/db/pool';
import { validateCsrfToken } from '@/lib/security/csrf';
import { checkRateLimit } from '@/lib/security/rate-limit';
import { revokeControlForBinding } from '@/lib/live-workspace/control';
import {
  assertOwnerResource,
  getLiveWorkspaceAccess,
  LiveWorkspaceError,
} from '@/lib/live-workspace/server';
import { publishCollaborationEvent } from '@/lib/realtime/ably';

export const runtime = 'nodejs';
const idSchema = z.string().uuid();
const attachSchema = z.object({
  resourceType: z.enum(['lab-instance', 'academy-course', 'infrastructure-design', 'storyboard', 'vault-item']),
  resourceId: z.string().uuid(),
}).strict();
const detachSchema = z.object({ bindingId: z.string().uuid() }).strict();

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return requireAuth(request, async (req, user) => {
    if (!(await validateCsrfToken(req))) return NextResponse.json({ error: 'Invalid or missing CSRF token' }, { status: 403 });
    const { id } = await params;
    if (!idSchema.safeParse(id).success) return NextResponse.json({ error: 'Invalid Live Workspace' }, { status: 400 });
    const rateLimit = await checkRateLimit(req, { maxRequests: 20, windowMs: 60 * 60_000 }, `${user.id}:${id}`);
    if (rateLimit) return rateLimit;
    const parsed = attachSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ error: 'Choose a supported resource' }, { status: 400 });

    const pool = getPool();
    try {
      const access = await getLiveWorkspaceAccess(pool, id, user.id);
      if (!access) throw new LiveWorkspaceError('Live Workspace not found or access denied.', 404, 'WORKSPACE_NOT_FOUND');

      const contributesOwnLab = parsed.data.resourceType === 'lab-instance' && access.capabilities.collaborate;
      if (!access.capabilities.manageResources && !contributesOwnLab) {
        throw new LiveWorkspaceError('You can only contribute your own Cyber Lab to this workspace.', 403, 'RESOURCE_MANAGEMENT_DENIED');
      }

      const resourceOwnerId = access.capabilities.manageResources ? access.ownerId : user.id;
      const resource = await assertOwnerResource(pool, resourceOwnerId, parsed.data.resourceType, parsed.data.resourceId);
      const result = await pool.query(
        `INSERT INTO live_workspace_resources (
           collaboration_id, resource_type, resource_id, resource_owner_id, attached_by, status, metadata
         ) VALUES ($1,$2,$3,$4,$5,'attached',$6::jsonb)
         ON CONFLICT (collaboration_id, resource_type, resource_id)
         DO UPDATE SET status='attached', detached_at=NULL, attached_by=EXCLUDED.attached_by,
                       resource_owner_id=EXCLUDED.resource_owner_id, metadata=EXCLUDED.metadata,
                       updated_at=NOW()
         RETURNING id, resource_type, resource_id, resource_owner_id, attached_by, metadata, attached_at`,
        [id, parsed.data.resourceType, resource.id, resourceOwnerId, user.id, stringifyPostgresJson({ label: resource.label })]
      );
      const row = result.rows[0];
      await publishCollaborationEvent({
        collaborationId: id,
        name: 'session.changed',
        data: { action: 'live-workspace.resource-attached', bindingId: row.id },
      });
      return NextResponse.json({
        resource: {
          id: row.id,
          type: row.resource_type,
          resourceId: row.resource_id,
          resourceOwnerId: row.resource_owner_id,
          attachedBy: row.attached_by,
          label: row.metadata?.label || row.resource_type,
          attachedAt: row.attached_at,
          ownershipTransferred: false,
        },
      }, { status: 201, headers: { 'Cache-Control': 'no-store' } });
    } catch (error) {
      if (error instanceof LiveWorkspaceError) {
        return NextResponse.json({ error: error.message, code: error.code }, { status: error.status, headers: { 'Cache-Control': 'no-store' } });
      }
      console.error('Live Workspace resource attach failed:', error);
      return NextResponse.json({ error: 'Could not attach Live Workspace resource' }, { status: 500 });
    }
  });
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return requireAuth(request, async (req, user) => {
    if (!(await validateCsrfToken(req))) return NextResponse.json({ error: 'Invalid or missing CSRF token' }, { status: 403 });
    const { id } = await params;
    if (!idSchema.safeParse(id).success) return NextResponse.json({ error: 'Invalid Live Workspace' }, { status: 400 });
    const parsed = detachSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ error: 'Exact resource binding id is required' }, { status: 400 });
    const pool = getPool();
    try {
      const access = await getLiveWorkspaceAccess(pool, id, user.id);
      if (!access) throw new LiveWorkspaceError('Live Workspace not found or access denied.', 404, 'WORKSPACE_NOT_FOUND');

      const binding = await pool.query(
        `SELECT resource_owner_id
           FROM live_workspace_resources
          WHERE id=$1 AND collaboration_id=$2 AND status='attached'
          LIMIT 1`,
        [parsed.data.bindingId, id]
      );
      const resourceOwnerId = binding.rows[0]?.resource_owner_id as string | undefined;
      if (!resourceOwnerId) throw new LiveWorkspaceError('Resource binding not found.', 404, 'RESOURCE_BINDING_NOT_FOUND');
      if (!access.capabilities.manageResources && resourceOwnerId !== user.id) {
        throw new LiveWorkspaceError('You can only detach a Cyber Lab you contributed.', 403, 'RESOURCE_MANAGEMENT_DENIED');
      }

      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        const result = await client.query(
          `UPDATE live_workspace_resources
           SET status='detached', detached_at=NOW(), updated_at=NOW()
           WHERE id=$1 AND collaboration_id=$2 AND status='attached'
           RETURNING id`,
          [parsed.data.bindingId, id]
        );
        if (!result.rowCount) throw new LiveWorkspaceError('Resource binding not found.', 404, 'RESOURCE_BINDING_NOT_FOUND');
        await revokeControlForBinding({
          queryable: client,
          collaborationId: id,
          bindingId: parsed.data.bindingId,
          actorId: user.id,
          reason: 'resource_detached',
        });
        await client.query('COMMIT');
      } catch (error) {
        await client.query('ROLLBACK').catch(() => undefined);
        throw error;
      } finally {
        client.release();
      }
      await publishCollaborationEvent({
        collaborationId: id,
        name: 'session.changed',
        data: { action: 'live-workspace.resource-detached', bindingId: parsed.data.bindingId },
      });
      return NextResponse.json({ detached: true, bindingId: parsed.data.bindingId }, { headers: { 'Cache-Control': 'no-store' } });
    } catch (error) {
      if (error instanceof LiveWorkspaceError) {
        return NextResponse.json({ error: error.message, code: error.code }, { status: error.status, headers: { 'Cache-Control': 'no-store' } });
      }
      console.error('Live Workspace resource detach failed:', error);
      return NextResponse.json({ error: 'Could not detach Live Workspace resource' }, { status: 500 });
    }
  });
}
