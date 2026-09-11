import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth/middleware';
import {
  abandonCuratedLearningPath,
  loadCuratedPathState,
  startCuratedLearningPath,
} from '@/lib/learning/curated-path-server';
import { getCuratedLearningPath } from '@/lib/learning/curated-paths';
import { validateCsrfToken } from '@/lib/security/csrf';
import { checkRateLimit } from '@/lib/security/rate-limit';

export const runtime = 'nodejs';

type Context = { params: Promise<{ pathId: string }> };

function resolvePath(pathId: string) {
  if (!/^[a-z0-9-]{1,96}$/.test(pathId)) return null;
  return getCuratedLearningPath(pathId);
}

export async function GET(request: NextRequest, { params }: Context) {
  return requireAuth(request, async (req, user) => {
    const { pathId } = await params;
    const path = resolvePath(pathId);
    if (!path) return NextResponse.json({ error: 'Learning path not found' }, { status: 404 });
    const rateLimit = await checkRateLimit(req, { maxRequests: 60, windowMs: 60_000 }, `${user.id}:learning-path:${path.id}`);
    if (rateLimit) return rateLimit;
    return NextResponse.json(
      { state: await loadCuratedPathState(user.id, path) },
      { headers: { 'Cache-Control': 'private, no-store' } },
    );
  });
}

export async function POST(request: NextRequest, { params }: Context) {
  return requireAuth(request, async (req, user) => {
    if (!(await validateCsrfToken(req))) {
      return NextResponse.json({ error: 'Invalid or missing CSRF token' }, { status: 403 });
    }
    const { pathId } = await params;
    const path = resolvePath(pathId);
    if (!path) return NextResponse.json({ error: 'Learning path not found' }, { status: 404 });
    const rateLimit = await checkRateLimit(req, { maxRequests: 8, windowMs: 60_000 }, `${user.id}:learning-path:${path.id}`);
    if (rateLimit) return rateLimit;

    const body = await req.json().catch(() => null) as { action?: string } | null;
    if (body?.action !== 'start') {
      return NextResponse.json({ error: 'Invalid learning-path action' }, { status: 400 });
    }

    return NextResponse.json(await startCuratedLearningPath(user.id, path));
  });
}

export async function PATCH(request: NextRequest, { params }: Context) {
  return requireAuth(request, async (req, user) => {
    if (!(await validateCsrfToken(req))) {
      return NextResponse.json({ error: 'Invalid or missing CSRF token' }, { status: 403 });
    }
    const { pathId } = await params;
    const path = resolvePath(pathId);
    if (!path) return NextResponse.json({ error: 'Learning path not found' }, { status: 404 });
    const rateLimit = await checkRateLimit(req, { maxRequests: 8, windowMs: 60_000 }, `${user.id}:learning-path:${path.id}`);
    if (rateLimit) return rateLimit;

    const body = await req.json().catch(() => null) as { action?: string } | null;
    if (body?.action !== 'abandon') {
      return NextResponse.json({ error: 'Invalid learning-path action' }, { status: 400 });
    }

    const result = await abandonCuratedLearningPath(user.id, path);
    if (!result.changed) {
      return NextResponse.json({ error: 'No active learning journey to leave' }, { status: 404 });
    }
    return NextResponse.json({ state: result.state });
  });
}
