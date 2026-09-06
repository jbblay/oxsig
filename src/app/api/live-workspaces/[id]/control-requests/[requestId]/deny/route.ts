import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAuth } from '@/lib/auth/middleware';
import { getPool } from '@/lib/db/pool';
import { validateCsrfToken } from '@/lib/security/csrf';
import { checkRateLimit } from '@/lib/security/rate-limit';
import { denyControlRequest } from '@/lib/live-workspace/control';
import { LiveWorkspaceError } from '@/lib/live-workspace/server';

export const runtime = 'nodejs';
const idSchema = z.string().uuid();

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; requestId: string }> }
) {
  return requireAuth(request, async (req, user) => {
    if (!(await validateCsrfToken(req))) {
      return NextResponse.json({ error: 'Invalid or missing CSRF token' }, { status: 403 });
    }
    const { id, requestId } = await params;
    if (!idSchema.safeParse(id).success || !idSchema.safeParse(requestId).success) {
      return NextResponse.json({ error: 'Invalid control request' }, { status: 400 });
    }
    const rateLimit = await checkRateLimit(req, { maxRequests: 60, windowMs: 60 * 60_000 }, `${user.id}:${id}:control-decision`);
    if (rateLimit) return rateLimit;

    try {
      const result = await denyControlRequest({
        pool: getPool(),
        collaborationId: id,
        requestId,
        grantorId: user.id,
      });
      return NextResponse.json(result, { headers: { 'Cache-Control': 'no-store' } });
    } catch (error) {
      if (error instanceof LiveWorkspaceError) {
        return NextResponse.json(
          { error: error.message, code: error.code },
          { status: error.status, headers: { 'Cache-Control': 'no-store' } }
        );
      }
      console.error('Live Workspace control denial failed:', error);
      return NextResponse.json({ error: 'Could not deny Live Workspace control' }, { status: 500 });
    }
  });
}
