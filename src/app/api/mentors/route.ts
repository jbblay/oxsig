import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAuth } from '@/lib/auth/middleware';
import { checkRateLimit } from '@/lib/security/rate-limit';
import { NO_STORE, mentorshipErrorResponse } from '@/lib/mentorship/http';
import { listMentorDirectory } from '@/lib/mentorship/server';
import { MENTOR_SPECIALIZATION_IDS } from '@/lib/mentorship/specializations';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const querySchema = z
  .object({
    specialization: z.enum(MENTOR_SPECIALIZATION_IDS).optional(),
    track: z.enum(['academy', 'external']).optional(),
  })
  .strict();

/** Directory of approved, listed mentors with at least one active qualification. */
export async function GET(request: NextRequest) {
  return requireAuth(request, async (req, user) => {
    const limited = await checkRateLimit(req, { maxRequests: 60, windowMs: 60_000 }, user.id, 'mentor-directory');
    if (limited) return limited;
    const parsed = querySchema.safeParse(Object.fromEntries(req.nextUrl.searchParams));
    if (!parsed.success) return NextResponse.json({ error: 'Invalid directory filter' }, { status: 400, headers: NO_STORE });
    try {
      const mentors = await listMentorDirectory({
        specializationId: parsed.data.specialization ?? null,
        track: parsed.data.track ?? null,
      });
      return NextResponse.json({ mentors }, { headers: NO_STORE });
    } catch (error) {
      return mentorshipErrorResponse(error, 'Mentor directory');
    }
  });
}
