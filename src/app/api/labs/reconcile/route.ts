import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth/middleware';
import { getPool } from '@/lib/db/pool';
import { getConfiguredLabCapabilities } from '@/lib/labs/read-model';
import { reconcileOwnedLabReadModel } from '@/lib/labs/reconciliation';
import { validateCsrfToken } from '@/lib/security/csrf';
import { checkRateLimit } from '@/lib/security/rate-limit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  return requireAuth(request, async (req, user) => {
    if (!(await validateCsrfToken(req))) {
      return NextResponse.json({ error: 'Invalid or missing CSRF token' }, { status: 403 });
    }

    const limited = await checkRateLimit(
      req,
      { maxRequests: 30, windowMs: 60_000 },
      user.id,
      'lab-status-reconcile'
    );
    if (limited) return limited;

    const capabilities = getConfiguredLabCapabilities();
    if (!capabilities.configured) {
      return NextResponse.json({
        ok: true,
        skipped: true,
        reason: 'runtime_unconfigured',
        checkedAt: new Date().toISOString(),
      });
    }

    const startedAt = performance.now();
    const result = await reconcileOwnedLabReadModel(getPool(), user.id);
    const totalMs = Math.max(0, performance.now() - startedAt);

    return NextResponse.json(
      {
        ok: result.failed === 0,
        ...result,
      },
      {
        status: result.reason === 'reconciliation_already_running' ? 202 : 200,
        headers: {
          'Server-Timing': `reconcile;dur=${totalMs.toFixed(1)}`,
          'Cache-Control': 'no-store',
        },
      }
    );
  });
}
