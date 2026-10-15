import { NextRequest, NextResponse } from 'next/server';
import { getRequestMetadata, logAudit } from '@/lib/audit/logger';
import { requireAuth } from '@/lib/auth/middleware';
import { validateCsrfToken } from '@/lib/security/csrf';
import { checkRateLimit } from '@/lib/security/rate-limit';
import { NO_STORE, mentorshipErrorResponse } from '@/lib/mentorship/http';
import { openRescueRoom } from '@/lib/mentorship/sessions';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
type RouteContext = { params: Promise<{ id: string }> };

/** Open (or rejoin) the time-limited Rescue Room for a confirmed session. */
export async function POST(request: NextRequest, { params }: RouteContext) {
  return requireAuth(request, async (req, user) => {
    if (!(await validateCsrfToken(req))) {
      return NextResponse.json({ error: 'Invalid or missing CSRF token' }, { status: 403, headers: NO_STORE });
    }
    const limited = await checkRateLimit(req, { maxRequests: 20, windowMs: 10 * 60_000 }, user.id, 'rescue-room');
    if (limited) return limited;
    const { id } = await params;
    if (!UUID.test(id)) return NextResponse.json({ error: 'Session not found' }, { status: 404, headers: NO_STORE });
    try {
      const room = await openRescueRoom(user.id, id);
      await logAudit({
        userId: user.id,
        action: 'mentorship.room.open',
        resourceType: 'mentorship_session',
        resourceId: id,
        metadata: { workspaceId: room.workspaceId },
        ...getRequestMetadata(req),
      });
      return NextResponse.json(room, { headers: NO_STORE });
    } catch (error) {
      return mentorshipErrorResponse(error, 'Rescue Room');
    }
  });
}
