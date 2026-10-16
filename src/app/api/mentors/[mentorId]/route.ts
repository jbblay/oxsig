import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth/middleware';
import { checkRateLimit } from '@/lib/security/rate-limit';
import { NO_STORE, mentorshipErrorResponse } from '@/lib/mentorship/http';
import { getPublicMentorProfile } from '@/lib/mentorship/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type RouteContext = { params: Promise<{ mentorId: string }> };

export async function GET(request: NextRequest, { params }: RouteContext) {
  return requireAuth(request, async (req, user) => {
    const limited = await checkRateLimit(req, { maxRequests: 120, windowMs: 60_000 }, user.id, 'mentor-profile');
    if (limited) return limited;
    const { mentorId } = await params;
    if (!UUID.test(mentorId)) return NextResponse.json({ error: 'Mentor not found' }, { status: 404, headers: NO_STORE });
    try {
      const mentor = await getPublicMentorProfile(mentorId);
      // Unlisted, paused, suspended or revoked mentors are indistinguishable from missing ones.
      if (!mentor) return NextResponse.json({ error: 'Mentor not found' }, { status: 404, headers: NO_STORE });
      return NextResponse.json({ mentor }, { headers: NO_STORE });
    } catch (error) {
      return mentorshipErrorResponse(error, 'Mentor profile');
    }
  });
}
