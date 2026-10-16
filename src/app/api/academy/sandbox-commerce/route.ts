import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth/middleware';
import { validateCsrfToken } from '@/lib/security/csrf';
import { checkRateLimit } from '@/lib/security/rate-limit';
import { sandboxCommerceCommandSchema, sandboxCommerceEnabled, SANDBOX_PLANS, SANDBOX_PACKAGES } from '@/lib/commerce/sandbox-policy';
import { applySandboxCommerceCommand, getSandboxCommerceState, SandboxCommerceError } from '@/lib/commerce/sandbox-server';
import { getRequestMetadata, logAudit } from '@/lib/audit/logger';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
const NO_STORE = { 'Cache-Control': 'no-store' };

export async function GET(request: NextRequest) {
  return requireAuth(request, async (_req, user) => {
    try {
      return NextResponse.json({ ...(await getSandboxCommerceState(user.id)), plans: SANDBOX_PLANS, packages: SANDBOX_PACKAGES }, { headers: NO_STORE });
    } catch (error) {
      console.error('Sandbox commerce read failed:', error);
      return NextResponse.json({ error: 'Sandbox commerce is unavailable.' }, { status: 503, headers: NO_STORE });
    }
  });
}

export async function POST(request: NextRequest) {
  return requireAuth(request, async (req, user) => {
    if (!sandboxCommerceEnabled()) {
      return NextResponse.json({ error: 'Sandbox commerce is disabled.' }, { status: 403, headers: NO_STORE });
    }
    if (!(await validateCsrfToken(req))) {
      return NextResponse.json({ error: 'Invalid or missing CSRF token.' }, { status: 403, headers: NO_STORE });
    }
    const limited = await checkRateLimit(req, { maxRequests: 15, windowMs: 60 * 60_000, failClosed: true }, user.id, 'sandbox-commerce');
    if (limited) return limited;
    const parsed = sandboxCommerceCommandSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ error: 'Invalid sandbox request.' }, { status: 400, headers: NO_STORE });
    try {
      const state = await applySandboxCommerceCommand(user.id, parsed.data);
      await logAudit({
        userId: user.id,
        action: 'commerce.sandbox.' + parsed.data.action,
        resourceType: 'sandbox_commerce',
        resourceId: user.id,
        metadata: { simulated: true, action: parsed.data.action },
        ...getRequestMetadata(req),
      });
      return NextResponse.json(state, { headers: NO_STORE });
    } catch (error) {
      if (error instanceof SandboxCommerceError) {
        return NextResponse.json({ error: error.message }, { status: error.status, headers: NO_STORE });
      }
      console.error('Sandbox commerce operation failed:', error);
      return NextResponse.json({ error: 'Sandbox operation failed.' }, { status: 503, headers: NO_STORE });
    }
  });
}
