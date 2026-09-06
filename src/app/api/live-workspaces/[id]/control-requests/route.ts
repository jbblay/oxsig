import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAuth } from '@/lib/auth/middleware';
import { getPool } from '@/lib/db/pool';
import { validateCsrfToken } from '@/lib/security/csrf';
import { checkRateLimit } from '@/lib/security/rate-limit';
import { createControlRequest, listControlState } from '@/lib/live-workspace/control';
import { LiveWorkspaceError } from '@/lib/live-workspace/server';

export const runtime = 'nodejs';

const idSchema = z.string().uuid();
const requestSchema = z.object({
  bindingId: z.string().uuid(),
  surface: z.enum(['terminal', 'desktop']),
}).strict();

function liveWorkspaceError(error: unknown, fallback: string) {
  if (error instanceof LiveWorkspaceError) {
    return NextResponse.json(
      { error: error.message, code: error.code },
      { status: error.status, headers: { 'Cache-Control': 'no-store' } }
    );
  }
  console.error(fallback, error);
  return NextResponse.json({ error: fallback }, { status: 500, headers: { 'Cache-Control': 'no-store' } });
}

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return requireAuth(request, async (_req, user) => {
    const { id } = await params;
    if (!idSchema.safeParse(id).success) {
      return NextResponse.json({ error: 'Invalid Live Workspace' }, { status: 400 });
    }

    try {
      const control = await listControlState({ pool: getPool(), collaborationId: id, viewerId: user.id });
      return NextResponse.json({ control }, { headers: { 'Cache-Control': 'no-store' } });
    } catch (error) {
      return liveWorkspaceError(error, 'Could not load Live Workspace control state');
    }
  });
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return requireAuth(request, async (req, user) => {
    if (!(await validateCsrfToken(req))) {
      return NextResponse.json({ error: 'Invalid or missing CSRF token' }, { status: 403 });
    }
    const { id } = await params;
    if (!idSchema.safeParse(id).success) {
      return NextResponse.json({ error: 'Invalid Live Workspace' }, { status: 400 });
    }
    const rateLimit = await checkRateLimit(req, { maxRequests: 30, windowMs: 60 * 60_000 }, `${user.id}:${id}:control-request`);
    if (rateLimit) return rateLimit;

    const parsed = requestSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json({ error: 'An attached lab binding and terminal/desktop surface are required' }, { status: 400 });
    }

    try {
      const controlRequest = await createControlRequest({
        pool: getPool(),
        collaborationId: id,
        participantId: user.id,
        bindingId: parsed.data.bindingId,
        surface: parsed.data.surface,
      });
      return NextResponse.json(
        { request: controlRequest },
        { status: 201, headers: { 'Cache-Control': 'no-store' } }
      );
    } catch (error) {
      return liveWorkspaceError(error, 'Could not request Live Workspace control');
    }
  });
}
