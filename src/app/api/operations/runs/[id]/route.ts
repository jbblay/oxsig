import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAuth } from '@/lib/auth/middleware';
import { getPool } from '@/lib/db/pool';
import { validateCsrfToken } from '@/lib/security/csrf';
import { checkRateLimit } from '@/lib/security/rate-limit';
import { destroyOperationRun, getOperationRun, OperationRuntimeError } from '@/lib/operations/runtime';

export const runtime = 'nodejs';
const idSchema = z.string().uuid();

function errorResponse(error: unknown) {
  if (error instanceof OperationRuntimeError) {
    return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
  }
  console.error('Operation run request failed:', error);
  return NextResponse.json({ error: 'Could not operate the Operation run' }, { status: 500 });
}

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return requireAuth(request, async (_req, user) => {
    const { id } = await params;
    if (!idSchema.safeParse(id).success) return NextResponse.json({ error: 'Invalid Operation run' }, { status: 400 });
    try {
      const run = await getOperationRun({ pool: getPool(), runId: id, ownerId: user.id });
      return NextResponse.json({ run }, { headers: { 'Cache-Control': 'private, no-store' } });
    } catch (error) {
      return errorResponse(error);
    }
  });
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return requireAuth(request, async (req, user) => {
    if (!(await validateCsrfToken(req))) return NextResponse.json({ error: 'Invalid or missing CSRF token' }, { status: 403 });
    const { id } = await params;
    if (!idSchema.safeParse(id).success) return NextResponse.json({ error: 'Invalid Operation run' }, { status: 400 });
    const rateLimit = await checkRateLimit(req, { maxRequests: 12, windowMs: 60 * 60_000 }, `${user.id}:operation-destroy`);
    if (rateLimit) return rateLimit;
    try {
      const result = await destroyOperationRun({ pool: getPool(), runId: id, ownerId: user.id });
      return NextResponse.json(result, { headers: { 'Cache-Control': 'private, no-store' } });
    } catch (error) {
      return errorResponse(error);
    }
  });
}
