import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAuth } from '@/lib/auth/middleware';
import { getPool } from '@/lib/db/pool';
import { listControlState } from '@/lib/live-workspace/control';
import {
  getLiveWorkspaceAccess,
  listLiveWorkspaceParticipants,
  listOwnerAttachableResources,
} from '@/lib/live-workspace/server';

export const runtime = 'nodejs';
const idSchema = z.string().uuid();

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return requireAuth(request, async (_req, user) => {
    const { id } = await params;
    if (!idSchema.safeParse(id).success) return NextResponse.json({ error: 'Invalid Live Workspace' }, { status: 400 });
    const pool = getPool();
    const access = await getLiveWorkspaceAccess(pool, id, user.id);
    if (!access) return NextResponse.json({ error: 'Live Workspace not found or access denied' }, { status: 404 });

    try {
      const [participants, resources, control, attachableResources] = await Promise.all([
        listLiveWorkspaceParticipants(pool, id),
        pool.query(
          `SELECT resource.id, resource.resource_type, resource.resource_id, resource.resource_owner_id,
                  resource.attached_by, resource.metadata, resource.attached_at,
                  CASE
                    WHEN resource.resource_type = 'lab-instance' AND lab.metadata->>'accessMode' = 'desktop' THEN 'desktop'
                    WHEN resource.resource_type = 'lab-instance' THEN 'terminal'
                    ELSE NULL
                  END AS access_mode
           FROM live_workspace_resources resource
           LEFT JOIN lab_instances lab
             ON resource.resource_type = 'lab-instance' AND lab.id = resource.resource_id
           WHERE resource.collaboration_id = $1 AND resource.status = 'attached'
           ORDER BY resource.attached_at ASC`,
          [id]
        ),
        listControlState({ pool, collaborationId: id, viewerId: user.id }),
        access.capabilities.manageResources
          ? listOwnerAttachableResources(pool, access.ownerId)
          : Promise.resolve([]),
      ]);
      const attachedKeys = new Set(resources.rows.map((row) => `${row.resource_type}:${row.resource_id}`));

      return NextResponse.json({
        viewerId: user.id,
        workspace: access,
        participants,
        resources: resources.rows.map((row) => ({
          id: row.id,
          type: row.resource_type,
          resourceId: row.resource_id,
          resourceOwnerId: row.resource_owner_id,
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