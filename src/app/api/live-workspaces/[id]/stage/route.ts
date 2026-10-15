import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAuth } from '@/lib/auth/middleware';
import { getPool } from '@/lib/db/pool';
import { getLiveWorkspaceAccess } from '@/lib/live-workspace/server';
import { validateCsrfToken } from '@/lib/security/csrf';
import { checkRateLimit } from '@/lib/security/rate-limit';
import { publishCollaborationEvent } from '@/lib/realtime/ably';

export const runtime = 'nodejs';

const uuid = z.string().uuid();
const stageSchema = z.object({
  surface: z.enum(['board', 'machine']),
  bindingId: uuid,
}).strict();

// Workspace participants follow the host's stage; this is presentation state,
// never permission to read an attached Board or operate an attached machine.
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return requireAuth(request, async (req, user) => {
    if (!(await validateCsrfToken(req))) {
      return NextResponse.json({ error: 'Invalid or missing CSRF token' }, { status: 403 });
    }
    const { id } = await params;
    if (!uuid.safeParse(id).success) {
      return NextResponse.json({ error: 'Invalid Live Workspace' }, { status: 400 });
    }
    const limited = await checkRateLimit(req, { maxRequests: 40, windowMs: 60_000 }, `${user.id}:${id}:stage`);
    if (limited) return limited;
    const parsed = stageSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json({ error: 'Choose an attached Board or Cyber Lab' }, { status: 400 });
    }

    const pool = getPool();
    try {
      const access = await getLiveWorkspaceAccess(pool, id, user.id);
      if (!access) return NextResponse.json({ error: 'Live Workspace not found or access denied' }, { status: 404 });
      if (access.role !== 'owner' && access.role !== 'instructor') {
        return NextResponse.json({ error: 'Only the host or instructor can change the presentation' }, { status: 403 });
      }
      const type = parsed.data.surface === 'board' ? 'storyboard' : 'lab-instance';
      const updated = await pool.query(
        `UPDATE collaborations c
            SET settings = jsonb_set(
                COALESCE(c.settings, '{}'::jsonb),
                '{liveWorkspaceStage}',
                jsonb_build_object('surface', $3::text, 'bindingId', $4::text),
                true
              ),
                updated_at = NOW()
          WHERE c.id = $1
            AND c.collaboration_type = 'live-workspace'
            AND c.status = 'active'
            AND EXISTS (
              SELECT 1 FROM live_workspace_resources r
               WHERE r.collaboration_id = c.id AND r.id = $4
                 AND r.status = 'attached' AND r.resource_type = $2
            )
          RETURNING c.id`,
        [id, type, parsed.data.surface, parsed.data.bindingId]
      );
      if (!updated.rowCount) {
        return NextResponse.json({ error: 'That resource is no longer attached to this workspace' }, { status: 409 });
      }
      await publishCollaborationEvent({
        collaborationId: id,
        name: 'session.changed',
        data: { action: 'live-workspace.stage-changed' },
      }).catch(() => undefined); // Fallback reconciliation still restores the stage.
      return NextResponse.json({ stage: parsed.data }, { headers: { 'Cache-Control': 'no-store' } });
    } catch (error) {
      console.error('Live Workspace stage switch failed:', error);
      return NextResponse.json({ error: 'Could not switch the presentation' }, { status: 500 });
    }
  });
}
