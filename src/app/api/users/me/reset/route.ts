import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAuth } from '@/lib/auth/middleware';
import { getPool } from '@/lib/db/pool';
import { resetEnabled } from '@/lib/account/test-reset-policy';
import { validateCsrfToken } from '@/lib/security/csrf';
import { checkRateLimit } from '@/lib/security/rate-limit';
import { purgeUserAccount } from '@/lib/account/lifecycle';

export const runtime = 'nodejs';

const bodySchema = z.object({ confirmation: z.literal('RESET MY OXSIG DATA') }).strict();


export async function GET(request: NextRequest) {
  return requireAuth(request, async () => NextResponse.json({ enabled: resetEnabled() }, { headers: { 'Cache-Control': 'no-store' } }));
}

export async function POST(request: NextRequest) {
  return requireAuth(request, async (req, user) => {
    if (!resetEnabled()) return NextResponse.json({ error: 'Test-account reset is disabled on this deployment' }, { status: 403 });
    if (!(await validateCsrfToken(req))) return NextResponse.json({ error: 'Invalid or missing CSRF token' }, { status: 403 });
    const rateLimit = await checkRateLimit(req, { maxRequests: 2, windowMs: 60 * 60_000 }, user.id);
    if (rateLimit) return rateLimit;

    const parsed = bodySchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ error: 'Type RESET MY OXSIG DATA to confirm' }, { status: 400 });

    const pool = getPool();
    const userRow = await pool.query(`SELECT id FROM users WHERE id=$1 AND is_active=true LIMIT 1`, [user.id]);
    if (!userRow.rows[0]) return NextResponse.json({ error: 'User not found' }, { status: 404 });

    try {
      await purgeUserAccount(pool, user.id);

      return NextResponse.json({ reset: true, signOutRequired: true }, { headers: { 'Cache-Control': 'no-store' } });
    } catch (error) {
      console.error('Test-account reset failed:', error);
      return NextResponse.json({ error: 'Could not reset this test account. No database user deletion was completed unless all external cleanup succeeded.' }, { status: 500 });
    }
  });
}
