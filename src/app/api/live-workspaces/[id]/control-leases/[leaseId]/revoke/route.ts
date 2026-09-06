import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAuth } from '@/lib/auth/middleware';
import { getPool } from '@/lib/db/pool';
import { validateCsrfToken } from '@/lib/security/csrf';
import { checkRateLimit } from '@/lib/security/rate-limit';
import { revokeControlLease } from '@/lib/live-workspace/control';
import { LiveWorkspaceError } from '@/lib/live-workspace/server';

export const runtime = 'nodejs';
const idSchema = z.string().uuid();

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; leaseId: string }> }
) {
  return requireAuth(request, async (req, user) => {
    if (!(await validateCsrfToken(req))) {
      return NextResponse.json({ error: 'Invalid or missing CSRF token' }, { status: 403 });
    }
    const { id, leaseId } = await params;
    if (!idSchema.safeParse(id).success || !idSchema.safeParse(leaseId).success) {
      return NextResponse.json({ error: 'Invalid control lease' }, { status: 400 });
    }
    const rateLimit = await checkRateLimit(req, { maxRequests: 60, windowMs: 60 * 60_000 }, `${user.id}:${id}:control-revoke`);
    if (rateLimit) return rateLimit;

    try {
      const result = await revokeControlLease({
        pool: getPool(),
        collaborationId: id,
        leaseId,
        actorId: user.id,
      });
      return NextResponse.json(result, { headers: { 'Cache-Control': 'no-store' } });
    } catch (error) {
      if (error instanceof LiveWorkspaceError) {
        return NextResponse.json(
          { error: error.message, code: error.code },
          { status: error.status, headers: { 'Cache-Control': 'no-store' } }
        );
      }
      console.error('Live Workspace control revocation failed:', error);
      return NextResponse.json({ error: 'Could not revoke Live Workspace control' }, { status: 500 });
    }
  });
}
