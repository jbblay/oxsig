import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth/middleware';
import { buildAccountExport } from '@/lib/account/export';
import { getRequestMetadata, logAudit } from '@/lib/audit/logger';
import { getPool } from '@/lib/db/pool';
import { checkRateLimit } from '@/lib/security/rate-limit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  return requireAuth(request, async (req, user) => {
    const rateLimit = await checkRateLimit(req, { maxRequests: 6, windowMs: 60 * 60_000 }, user.id, 'account-export');
    if (rateLimit) return rateLimit;

    try {
      const payload = await buildAccountExport(getPool(), user.id);
      if (!payload) return NextResponse.json({ error: 'User not found' }, { status: 404 });

      await logAudit({ userId: user.id, action: 'account.export', resourceType: 'user', resourceId: user.id, ...getRequestMetadata(req) });

      const date = new Date().toISOString().slice(0, 10);
      return new NextResponse(JSON.stringify(payload, null, 2), {
        status: 200,
        headers: {
          'Content-Type': 'application/json; charset=utf-8',
          'Content-Disposition': `attachment; filename="oxsig-account-${date}.json"`,
          'Cache-Control': 'no-store',
        },
      });
    } catch (error) {
      console.error('Account export failed:', error);
      return NextResponse.json({ error: 'Could not prepare your export. Try again in a moment.' }, { status: 500 });
    }
  });
}
