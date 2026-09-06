import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAuth } from '@/lib/auth/middleware';
import { getPool } from '@/lib/db/pool';
import { validateCsrfToken } from '@/lib/security/csrf';
import { checkRateLimit } from '@/lib/security/rate-limit';
import { revokeControlForParticipant } from '@/lib/live-workspace/control';
import { assignLiveWorkspaceRole, LiveWorkspaceError } from '@/lib/live-workspace/server';

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
      if (parsed.data.role === 'observer') {
        await revokeControlForParticipant({
          queryable: pool,
          collaborationId: id,
          participantId: userId,
          actorId: user.id,
          reason: 'role_became_observer',
        });
      }
      return NextResponse.json({ participant: { userId, ...assigned } }, { headers: { 'Cache-Control': 'no-store' } });
    } catch (error) {
      if (error instanceof LiveWorkspaceError) {
        return NextResponse.json({ error: error.message, code: error.code }, { status: error.status, headers: { 'Cache-Control': 'no-store' } });
      }
      console.error('Live Workspace role update failed:', error);
      return NextResponse.json({ error: 'Could not update participant role' }, { status: 500 });
    }
  });
}
