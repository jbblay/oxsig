import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAuth } from '@/lib/auth/middleware';
import { getPool } from '@/lib/db/pool';
import { validateCsrfToken } from '@/lib/security/csrf';
import { checkRateLimit } from '@/lib/security/rate-limit';
import { provisionOperationRun, OperationRuntimeError } from '@/lib/operations/runtime';

export const runtime = 'nodejs';

const bodySchema = z.object({ mode: z.enum(['practice','walkthrough','challenge','warroom']) }).strict();
const slugSchema = z.string().min(1).max(120).regex(/^[a-z0-9-]+$/);

function errorResponse(error: unknown) {
  if (error instanceof OperationRuntimeError) {
    return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
  }
  console.error('Operation provisioning failed:', error);
  return NextResponse.json({ error: 'Could not provision the Operation runtime', code: 'OPERATION_PROVISION_FAILED' }, { status: 500 });
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  return requireAuth(request, async (req, user) => {
    if (!(await validateCsrfToken(req))) return NextResponse.json({ error: 'Invalid or missing CSRF token' }, { status: 403 });
    const { slug } = await params;
    if (!slugSchema.safeParse(slug).success) return NextResponse.json({ error: 'Invalid Operation' }, { status: 400 });
    const parsed = bodySchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ error: 'Choose a supported Operation mode' }, { status: 400 });
    const rateLimit = await checkRateLimit(req, { maxRequests: 4, windowMs: 60 * 60_000 }, `${user.id}:operation:${slug}`);
    if (rateLimit) return rateLimit;

    try {
      const run = await provisionOperationRun({ pool: getPool(), ownerId: user.id, slug, mode: parsed.data.mode });
      return NextResponse.json({ run }, { status: 201, headers: { 'Cache-Control': 'private, no-store' } });
    } catch (error) {
      return errorResponse(error);
    }
  });
}
