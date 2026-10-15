import { NextRequest, NextResponse } from 'next/server';
import { getRequestMetadata, logAudit } from '@/lib/audit/logger';
import { requireAuth } from '@/lib/auth/middleware';
import { validateCsrfToken } from '@/lib/security/csrf';
import { checkRateLimit } from '@/lib/security/rate-limit';
import { NO_STORE, mentorshipErrorResponse } from '@/lib/mentorship/http';
import { mentorProfileUpdateSchema } from '@/lib/mentorship/policy';
import { updateOwnMentorProfile } from '@/lib/mentorship/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Mentors edit their own presentation and pause/resume themselves. Tier and qualifications are admin-only. */
export async function PATCH(request: NextRequest) {
  return requireAuth(request, async (req, user) => {
    if (!(await validateCsrfToken(req))) {
      return NextResponse.json({ error: 'Invalid or missing CSRF token' }, { status: 403, headers: NO_STORE });
    }
    const limited = await checkRateLimit(req, { maxRequests: 30, windowMs: 10 * 60_000 }, user.id, 'mentor-profile-update');
    if (limited) return limited;
    const parsed = mentorProfileUpdateSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0]?.message || 'Invalid profile update' }, { status: 400, headers: NO_STORE });
    }
    try {
      const result = await updateOwnMentorProfile(user.id, parsed.data);
      await logAudit({
        userId: user.id,
        action: 'mentor.profile.update',
        resourceType: 'mentor_profile',
        resourceId: user.id,
        metadata: { fields: Object.keys(parsed.data), status: result.status },
        ...getRequestMetadata(req),
      });
      return NextResponse.json({ ok: true, ...result }, { headers: NO_STORE });
    } catch (error) {
      return mentorshipErrorResponse(error, 'Mentor profile update');
    }
  });
}
