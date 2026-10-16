import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getRequestMetadata, logAudit } from '@/lib/audit/logger';
import { requireAuth } from '@/lib/auth/middleware';
import { validateCsrfToken } from '@/lib/security/csrf';
import { checkRateLimit } from '@/lib/security/rate-limit';
import { NO_STORE, mentorshipErrorResponse } from '@/lib/mentorship/http';
import { availabilityInputSchema, offeringInputSchema } from '@/lib/mentorship/scheduling';
import { getMentorSchedule, replaceMentorAvailability, saveMentorOffering, setMentorOfferingActive } from '@/lib/mentorship/sessions';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const commandSchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('save_offering'), offeringId: z.string().uuid().optional(), offering: offeringInputSchema }).strict(),
  z.object({ action: z.literal('set_offering_active'), offeringId: z.string().uuid(), isActive: z.boolean() }).strict(),
  z.object({ action: z.literal('set_availability'), availability: availabilityInputSchema }).strict(),
]);

/** The signed-in mentor's own session types and weekly availability. */
export async function GET(request: NextRequest) {
  return requireAuth(request, async (req, user) => {
    const limited = await checkRateLimit(req, { maxRequests: 60, windowMs: 60_000 }, user.id, 'mentor-schedule');
    if (limited) return limited;
    try {
      return NextResponse.json(await getMentorSchedule(user.id), { headers: NO_STORE });
    } catch (error) {
      return mentorshipErrorResponse(error, 'Mentor schedule');
    }
  });
}

export async function POST(request: NextRequest) {
  return requireAuth(request, async (req, user) => {
    if (!(await validateCsrfToken(req))) {
      return NextResponse.json({ error: 'Invalid or missing CSRF token' }, { status: 403, headers: NO_STORE });
    }
    const limited = await checkRateLimit(req, { maxRequests: 40, windowMs: 10 * 60_000 }, user.id, 'mentor-schedule-update');
    if (limited) return limited;
    const parsed = commandSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0]?.message || 'Invalid schedule update' }, { status: 400, headers: NO_STORE });
    }
    const body = parsed.data;
    try {
      let result: unknown;
      if (body.action === 'save_offering') result = { offering: await saveMentorOffering(user.id, body.offering, body.offeringId ?? null) };
      else if (body.action === 'set_offering_active') result = { offering: await setMentorOfferingActive(user.id, body.offeringId, body.isActive) };
      else result = { rules: await replaceMentorAvailability(user.id, body.availability.rules) };
      await logAudit({
        userId: user.id,
        action: `mentor.schedule.${body.action}`,
        resourceType: 'mentor_profile',
        resourceId: user.id,
        ...getRequestMetadata(req),
      });
      return NextResponse.json(result, { headers: NO_STORE });
    } catch (error) {
      return mentorshipErrorResponse(error, 'Mentor schedule update');
    }
  });
}
