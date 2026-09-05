import { NextRequest, NextResponse } from 'next/server';
import { listAcademyCourseHistory } from '@/lib/academy/persistence';
import { requireAuth } from '@/lib/auth/middleware';
import { checkRateLimit } from '@/lib/security/rate-limit';

export const runtime = 'nodejs';

export async function GET(request: NextRequest) {
  return requireAuth(request, async (req, user) => {
    const rateLimit = await checkRateLimit(req, { maxRequests: 60, windowMs: 60_000 }, user.id);
    if (rateLimit) return rateLimit;

    const requestedLimit = Number(new URL(req.url).searchParams.get('limit') || 20);
    const limit = Number.isFinite(requestedLimit)
      ? Math.min(50, Math.max(1, Math.trunc(requestedLimit)))
      : 20;

    const courses = await listAcademyCourseHistory(user.id, limit);
    return NextResponse.json(
      { courses },
      { headers: { 'Cache-Control': 'no-store' } }
    );
  });
}
