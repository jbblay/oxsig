import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth/middleware';
import { checkRateLimit } from '@/lib/security/rate-limit';
import { NO_STORE, mentorshipErrorResponse } from '@/lib/mentorship/http';
import { getMentorCenterState } from '@/lib/mentorship/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** The signed-in user's progression, eligibility, applications and mentor profile. */
export async function GET(request: NextRequest) {
  return requireAuth(request, async (req, user) => {
    const limited = await checkRateLimit(req, { maxRequests: 60, windowMs: 60_000 }, user.id, 'mentor-center');
    if (limited) return limited;
    try {
      return NextResponse.json(await getMentorCenterState(user.id), { headers: NO_STORE });
    } catch (error) {
      return mentorshipErrorResponse(error, 'Mentor center');
    }
  });
}
