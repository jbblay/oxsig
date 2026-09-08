import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth/middleware';
import {
  deleteInfrastructureDesign,
  getInfrastructureDesign,
  saveInfrastructureDesign,
} from '@/lib/infrastructure/designer-persistence';
import { infrastructureDesignSchema } from '@/lib/infrastructure/designer-schema';
import { validateCsrfToken } from '@/lib/security/csrf';
import { checkRateLimit } from '@/lib/security/rate-limit';

export const runtime = 'nodejs';

export async function GET(request: NextRequest) {
  return requireAuth(request, async (req, user) => {
    const rateLimit = await checkRateLimit(req, { maxRequests: 60, windowMs: 60_000 }, user.id);
    if (rateLimit) return rateLimit;

    const state = await getInfrastructureDesign(user.id);
    return NextResponse.json(
      {
        design: state?.design ?? null,
        updatedAt: state?.updatedAt ?? null,
      },
      { headers: { 'Cache-Control': 'no-store' } }
    );
  });
}

export async function PUT(request: NextRequest) {
  return requireAuth(request, async (req, user) => {
    if (!(await validateCsrfToken(req))) {
      return NextResponse.json({ error: 'Invalid or missing CSRF token' }, { status: 403 });
    }

    const rateLimit = await checkRateLimit(req, { maxRequests: 30, windowMs: 60_000 }, user.id);
    if (rateLimit) return rateLimit;

    const parsed = infrastructureDesignSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid infrastructure design', details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const saved = await saveInfrastructureDesign(user.id, parsed.data);
    return NextResponse.json({ design: saved.design, updatedAt: saved.updatedAt });
  });
}

export async function DELETE(request: NextRequest) {
  return requireAuth(request, async (req, user) => {
    if (!(await validateCsrfToken(req))) {
      return NextResponse.json({ error: 'Invalid or missing CSRF token' }, { status: 403 });
    }

    const rateLimit = await checkRateLimit(req, { maxRequests: 12, windowMs: 60_000 }, user.id);
    if (rateLimit) return rateLimit;

    const deleted = await deleteInfrastructureDesign(user.id);
    return NextResponse.json({ ok: true, deleted });
  });
}
