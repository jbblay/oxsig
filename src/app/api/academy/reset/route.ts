import { NextRequest, NextResponse } from 'next/server';
import { getPool } from '@/lib/db/pool';
import { requireAuth } from '@/lib/auth/middleware';
import { validateCsrfToken } from '@/lib/security/csrf';
import { checkRateLimit } from '@/lib/security/rate-limit';

export const runtime = 'nodejs';

export async function DELETE(request: NextRequest) {
  return requireAuth(request, async (req, user) => {
    if (!(await validateCsrfToken(req))) {
      return NextResponse.json({ error: 'Invalid or missing CSRF token' }, { status: 403 });
    }

    const rateLimit = await checkRateLimit(req, { maxRequests: 3, windowMs: 60 * 60 * 1000, failClosed: true }, user.id);
    if (rateLimit) return rateLimit;

    await getPool().query('DELETE FROM academy_courses WHERE owner_id = $1', [user.id]);

    return NextResponse.json(
      { ok: true },
      { headers: { 'Cache-Control': 'no-store' } }
    );
  });
}
