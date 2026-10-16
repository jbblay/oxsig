import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { captureProductEvent } from '@/lib/analytics/posthog';
import { getRequestMetadata, logAudit } from '@/lib/audit/logger';
import { requireAuth } from '@/lib/auth/middleware';
import { validateCsrfToken } from '@/lib/security/csrf';
import { checkRateLimit } from '@/lib/security/rate-limit';
import { NO_STORE, mentorshipErrorResponse } from '@/lib/mentorship/http';
import { mentorApplicationInputSchema } from '@/lib/mentorship/policy';
import { resubmitMentorApplication, submitMentorApplication, withdrawMentorApplication } from '@/lib/mentorship/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const actionSchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('submit'), application: z.unknown() }).strict(),
  z.object({ action: z.literal('resubmit'), applicationId: z.string().uuid(), application: z.unknown() }).strict(),
  z.object({ action: z.literal('withdraw'), applicationId: z.string().uuid() }).strict(),
]);

export async function POST(request: NextRequest) {
  return requireAuth(request, async (req, user) => {
    if (!(await validateCsrfToken(req))) {
      return NextResponse.json({ error: 'Invalid or missing CSRF token' }, { status: 403, headers: NO_STORE });
    }
    const limited = await checkRateLimit(req, { maxRequests: 10, windowMs: 60 * 60_000, failClosed: true }, user.id, 'mentor-application');
    if (limited) return limited;

    const parsed = actionSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ error: 'Invalid mentor application request' }, { status: 400, headers: NO_STORE });
    const body = parsed.data;
    const audit = { userId: user.id, resourceType: 'mentor_application', ...getRequestMetadata(req) };

    try {
      if (body.action === 'withdraw') {
        const application = await withdrawMentorApplication(user.id, body.applicationId);
        await logAudit({ ...audit, resourceId: application.id, action: 'mentor.application.withdraw' });
        return NextResponse.json({ application }, { headers: NO_STORE });
      }

      const input = mentorApplicationInputSchema.safeParse(body.application);
      if (!input.success) {
        return NextResponse.json(
          { error: input.error.issues[0]?.message || 'Invalid application', details: input.error.flatten() },
          { status: 400, headers: NO_STORE }
        );
      }

      const application = body.action === 'submit'
        ? await submitMentorApplication(user.id, input.data)
        : await resubmitMentorApplication(user.id, body.applicationId, input.data);
      await logAudit({
        ...audit,
        resourceId: application.id,
        action: `mentor.application.${body.action}`,
        metadata: { track: application.track, specializations: application.specializations },
      });
      await captureProductEvent({
        distinctId: user.clerkUserId || user.id,
        event: 'mentor_application_submitted',
        properties: { track: application.track, specialization_count: application.specializations.length, resubmission: body.action === 'resubmit' },
      });
      return NextResponse.json({ application }, { status: body.action === 'submit' ? 201 : 200, headers: NO_STORE });
    } catch (error) {
      return mentorshipErrorResponse(error, 'Mentor application');
    }
  });
}
