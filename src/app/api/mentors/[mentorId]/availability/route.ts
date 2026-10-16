import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth/middleware';
import { checkRateLimit } from '@/lib/security/rate-limit';
import { NO_STORE, mentorshipErrorResponse } from '@/lib/mentorship/http';
import { getMentorAvailability } from '@/lib/mentorship/sessions';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type RouteContext = { params: Promise<{ mentorId: string }> };

/** Open start times only. Other people's bookings are never revealed. */
export async function GET(request: NextRequest, { params }: RouteContext) {
  return requireAuth(request, async (req, user) => {
    const limited = await checkRateLimit(req, { maxRequests: 60, windowMs: 60_000 }, user.id, 'mentor-availability');
    if (limited) return limited;
    const { mentorId } = await params;
    const offeringId = req.nextUrl.searchParams.get('offeringId') || '';
    if (!UUID.test(mentorId) || !UUID.test(offeringId)) {
      return NextResponse.json({ error: 'Choose a mentor and a session type' }, { status: 400, headers: NO_STORE });
    }
    try {
      return NextResponse.json(await getMentorAvailability(user.id, mentorId, offeringId), { headers: NO_STORE });
    } catch (error) {
      return mentorshipErrorResponse(error, 'Mentor availability');
    }
  });
}
