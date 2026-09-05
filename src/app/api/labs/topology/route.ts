import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth/middleware';
import { getLabTopology, saveLabTopology } from '@/lib/labs/topology-persistence';
import { labTopologySchema } from '@/lib/labs/topology-schema';
import { validateCsrfToken } from '@/lib/security/csrf';
import { checkRateLimit } from '@/lib/security/rate-limit';

export const runtime = 'nodejs';

export async function GET(request: NextRequest) {
  return requireAuth(request, async (req, user) => {
    const rateLimit = await checkRateLimit(req, { maxRequests: 60, windowMs: 60_000 }, user.id);
    if (rateLimit) return rateLimit;

    const state = await getLabTopology(user.id);
    return NextResponse.json(
      {
        topology: state?.topology ?? null,
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

    const parsed = labTopologySchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid Cyber Lab topology', details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const saved = await saveLabTopology(user.id, parsed.data);
    return NextResponse.json({ topology: saved.topology, updatedAt: saved.updatedAt });
  });
}
