import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAuth } from '@/lib/auth/middleware';
import { getPool } from '@/lib/db/pool';
import { getLiveWorkspaceAccess, listLiveWorkspaceParticipants } from '@/lib/live-workspace/server';

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
      const [participants, resources] = await Promise.all([
        listLiveWorkspaceParticipants(pool, id),
        pool.query(
          `SELECT id, resource_type, resource_id, resource_owner_id, attached_by, metadata, attached_at
           FROM live_workspace_resources
           WHERE collaboration_id = $1 AND status = 'attached'
           ORDER BY attached_at ASC`,
          [id]
        ),
      ]);
      return NextResponse.json({
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
          ownershipTransferred: false,
        })),
        control: {
          terminalLeaseActive: false,
          desktopLeaseActive: false,
          note: 'Foundation v1 defines eligibility and permissions only. It does not grant shared terminal or desktop input.',
        },
      }, { headers: { 'Cache-Control': 'no-store' } });
    } catch (error) {
      console.error('Live Workspace detail failed:', error);
      return NextResponse.json({ error: 'Could not load Live Workspace' }, { status: 500 });
    }
  });
}
