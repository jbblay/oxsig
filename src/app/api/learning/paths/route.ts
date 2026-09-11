import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth/middleware';
import { loadCuratedPathState } from '@/lib/learning/curated-path-server';
import { CURATED_LEARNING_PATHS } from '@/lib/learning/curated-paths';
import { checkRateLimit } from '@/lib/security/rate-limit';

export const runtime = 'nodejs';

export async function GET(request: NextRequest) {
  return requireAuth(request, async (req, user) => {
    const rateLimit = await checkRateLimit(req, { maxRequests: 60, windowMs: 60_000 }, `${user.id}:learning-paths`);
    if (rateLimit) return rateLimit;

    const states = await Promise.all(
      CURATED_LEARNING_PATHS.map((path) => loadCuratedPathState(user.id, path))
    );

    return NextResponse.json(
      { paths: states },
      { headers: { 'Cache-Control': 'private, no-store' } },
    );
  });
}
