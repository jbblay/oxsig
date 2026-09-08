import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAuth } from '@/lib/auth/middleware';
import { getPool } from '@/lib/db/pool';
import { createWorkspaceNotification } from '@/lib/notifications/server';
import { validateCsrfToken } from '@/lib/security/csrf';
import { checkRateLimit } from '@/lib/security/rate-limit';
import { approveControlRequest, CONTROL_LEASE_MINUTES } from '@/lib/live-workspace/control';
import { LiveWorkspaceError } from '@/lib/live-workspace/server';

export const runtime = 'nodejs';

const idSchema = z.string().uuid();
const bodySchema = z.object({
  durationMinutes: z.number().int().min(CONTROL_LEASE_MINUTES.min).max(CONTROL_LEASE_MINUTES.max).optional(),
}).strict();

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; requestId: string }> }
) {
  return requireAuth(request, async (req, user) => {
    if (!(await validateCsrfToken(req))) {
      return NextResponse.json({ error: 'Invalid or missing CSRF token' }, { status: 403 });
    }
    const { id, requestId } = await params;
    if (!idSchema.safeParse(id).success || !idSchema.safeParse(requestId).success) {
      return NextResponse.json({ error: 'Invalid control request' }, { status: 400 });
    }
    const rateLimit = await checkRateLimit(req, { maxRequests: 60, windowMs: 60 * 60_000 }, `${user.id}:${id}:control-decision`);
    if (rateLimit) return rateLimit;

    const parsed = bodySchema.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) {
      return NextResponse.json(
        { error: `Control duration must be ${CONTROL_LEASE_MINUTES.min}-${CONTROL_LEASE_MINUTES.max} minutes` },
        { status: 400 }
      );
    }

    try {
      const pool = getPool();
      const durationMinutes = parsed.data.durationMinutes ?? CONTROL_LEASE_MINUTES.default;
      const lease = await approveControlRequest({
        pool,
        collaborationId: id,
        requestId,
        grantorId: user.id,
        durationMinutes,
      });

      if (lease.participantId) {
        try {
          await createWorkspaceNotification({
            ownerId: lease.participantId,
            type: 'live.control_granted',
            title: `${lease.surface === 'desktop' ? 'Desktop' : 'Terminal'} control granted`,
            detail: `You have control of ${lease.labLabel || 'the attached lab'} for ${durationMinutes} minutes.`,
            href: '/live',
            severity: 'success',
            sourceType: 'live-control-lease',
            sourceId: lease.id,
            dedupeKey: `live-control-granted:${requestId}`,
            queryable: pool,
          });
        } catch (notificationError) {
          console.warn('Live Workspace control approval notification failed:', notificationError);
        }
      }

      return NextResponse.json({ lease }, { status: 201, headers: { 'Cache-Control': 'no-store' } });
    } catch (error) {
      if (error instanceof LiveWorkspaceError) {
        return NextResponse.json(
          { error: error.message, code: error.code },
          { status: error.status, headers: { 'Cache-Control': 'no-store' } }
        );
      }
      console.error('Live Workspace control approval failed:', error);
      return NextResponse.json({ error: 'Could not approve Live Workspace control' }, { status: 500 });
    }
  });
}
