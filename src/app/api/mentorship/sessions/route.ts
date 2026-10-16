import { NextRequest, NextResponse } from 'next/server';
import { captureProductEvent } from '@/lib/analytics/posthog';
import { getRequestMetadata, logAudit } from '@/lib/audit/logger';
import { requireAuth } from '@/lib/auth/middleware';
import { validateCsrfToken } from '@/lib/security/csrf';
import { checkRateLimit } from '@/lib/security/rate-limit';
import { NO_STORE, mentorshipErrorResponse } from '@/lib/mentorship/http';
import { bookingInputSchema } from '@/lib/mentorship/scheduling';
import { bookMentorshipSession, listMentorshipSessions } from '@/lib/mentorship/sessions';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Sessions where the signed-in user is the learner or the mentor. */
export async function GET(request: NextRequest) {
  return requireAuth(request, async (req, user) => {
    const limited = await checkRateLimit(req, { maxRequests: 60, windowMs: 60_000 }, user.id, 'mentorship-sessions');
    if (limited) return limited;
    try {
      return NextResponse.json({ sessions: await listMentorshipSessions(user.id) }, { headers: NO_STORE });
    } catch (error) {
      return mentorshipErrorResponse(error, 'Mentorship sessions');
    }
  });
}

/** Book a free session. The learner is always the authenticated user. */
export async function POST(request: NextRequest) {
  return requireAuth(request, async (req, user) => {
    if (!(await validateCsrfToken(req))) {
      return NextResponse.json({ error: 'Invalid or missing CSRF token' }, { status: 403, headers: NO_STORE });
    }
    const limited = await checkRateLimit(req, { maxRequests: 10, windowMs: 60 * 60_000, failClosed: true }, user.id, 'mentorship-booking');
    if (limited) return limited;
    const parsed = bookingInputSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0]?.message || 'Invalid booking' }, { status: 400, headers: NO_STORE });
    }
    try {
      const session = await bookMentorshipSession(user.id, parsed.data);
      await logAudit({
        userId: user.id,
        action: 'mentorship.session.book',
        resourceType: 'mentorship_session',
        resourceId: session.id,
        metadata: { mentorId: parsed.data.mentorId, kind: session.kind, sharedAcademyContext: parsed.data.shareAcademyContext },
        ...getRequestMetadata(req),
      });
      await captureProductEvent({
        distinctId: user.clerkUserId || user.id,
        event: 'mentorship_session_booked',
        properties: { kind: session.kind, duration_minutes: session.durationMinutes, shared_context: parsed.data.shareAcademyContext },
      });
      return NextResponse.json({ session }, { status: 201, headers: NO_STORE });
    } catch (error) {
      return mentorshipErrorResponse(error, 'Mentorship booking');
    }
  });
}
