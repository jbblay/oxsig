import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getRequestMetadata, logAudit } from '@/lib/audit/logger';
import { requireAuth } from '@/lib/auth/middleware';
import { validateCsrfToken } from '@/lib/security/csrf';
import { checkRateLimit } from '@/lib/security/rate-limit';
import { NO_STORE, mentorshipErrorResponse } from '@/lib/mentorship/http';
import { applySessionCommand, getMentorshipSession } from '@/lib/mentorship/sessions';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
type RouteContext = { params: Promise<{ id: string }> };

const reason = z.string().trim().min(3).max(500);
const commandSchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('confirm'), note: z.string().trim().max(1000).optional() }).strict(),
  z.object({ action: z.literal('decline'), reason }).strict(),
  z.object({ action: z.literal('cancel'), reason }).strict(),
  z.object({ action: z.literal('complete'), summary: z.string().trim().max(4000).optional() }).strict(),
  z.object({ action: z.literal('no_show') }).strict(),
  z.object({ action: z.literal('summary'), summary: z.string().trim().min(10).max(4000) }).strict(),
  z.object({ action: z.literal('reschedule'), startsAt: z.string().datetime({ offset: true }) }).strict(),
]);

export async function GET(request: NextRequest, { params }: RouteContext) {
  return requireAuth(request, async (req, user) => {
    const limited = await checkRateLimit(req, { maxRequests: 120, windowMs: 60_000 }, user.id, 'mentorship-session');
    if (limited) return limited;
    const { id } = await params;
    if (!UUID.test(id)) return NextResponse.json({ error: 'Session not found' }, { status: 404, headers: NO_STORE });
    try {
      return NextResponse.json({ session: await getMentorshipSession(user.id, id) }, { headers: NO_STORE });
    } catch (error) {
      return mentorshipErrorResponse(error, 'Mentorship session');
    }
  });
}

export async function PATCH(request: NextRequest, { params }: RouteContext) {
  return requireAuth(request, async (req, user) => {
    if (!(await validateCsrfToken(req))) {
      return NextResponse.json({ error: 'Invalid or missing CSRF token' }, { status: 403, headers: NO_STORE });
    }
    const limited = await checkRateLimit(req, { maxRequests: 30, windowMs: 10 * 60_000 }, user.id, 'mentorship-session-update');
    if (limited) return limited;
    const { id } = await params;
    if (!UUID.test(id)) return NextResponse.json({ error: 'Session not found' }, { status: 404, headers: NO_STORE });
    const parsed = commandSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0]?.message || 'Invalid session update' }, { status: 400, headers: NO_STORE });
    }
    try {
      const session = await applySessionCommand(user.id, id, parsed.data);
      await logAudit({
        userId: user.id,
        action: `mentorship.session.${parsed.data.action}`,
        resourceType: 'mentorship_session',
        resourceId: id,
        metadata: { resultingSessionId: session.id, status: session.status },
        ...getRequestMetadata(req),
      });
      return NextResponse.json({ session }, { headers: NO_STORE });
    } catch (error) {
      return mentorshipErrorResponse(error, 'Mentorship session update');
    }
  });
}
