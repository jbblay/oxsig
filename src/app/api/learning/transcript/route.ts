import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth/middleware';
import { loadProvedSkillTranscript } from '@/lib/learning/transcript-server';
import { checkRateLimit } from '@/lib/security/rate-limit';

export const runtime = 'nodejs';

export async function GET(request: NextRequest) {
  return requireAuth(request, async (req, user) => {
    const rateLimit = await checkRateLimit(req, { maxRequests: 60, windowMs: 60_000 }, `${user.id}:learning-transcript`);
    if (rateLimit) return rateLimit;

    const transcript = await loadProvedSkillTranscript(user.id);
    return NextResponse.json(
      { transcript },
      { headers: { 'Cache-Control': 'private, no-store' } },
    );
  });
}
