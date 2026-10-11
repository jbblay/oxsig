import 'server-only';

import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin, type AuthenticatedUser } from '@/lib/auth/middleware';
import { validateCsrfToken } from '@/lib/security/csrf';
import { checkRateLimit } from '@/lib/security/rate-limit';

export const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Every /api/admin route goes through this guard: platform-admin role,
 * no-store responses, CSRF on mutations and an admin-scoped rate limit.
 */
export async function withPlatformAdmin(
  request: NextRequest,
  handler: (request: NextRequest, admin: AuthenticatedUser) => Promise<NextResponse>,
  options: { mutation?: boolean } = {}
): Promise<NextResponse> {
  const response = await requireAdmin(request, async (req, admin) => {
    if (options.mutation && !(await validateCsrfToken(req))) {
      return NextResponse.json({ error: 'Invalid or missing CSRF token' }, { status: 403 });
    }
    const limited = await checkRateLimit(
      req,
      options.mutation ? { maxRequests: 60, windowMs: 10 * 60_000, failClosed: true } : { maxRequests: 300, windowMs: 60_000 },
      admin.id,
      options.mutation ? 'admin-mutation' : 'admin-read'
    );
    if (limited) return limited;

    try {
      return await handler(req, admin);
    } catch (error) {
      console.error(`Admin API ${req.method} ${req.nextUrl.pathname} failed:`, error);
      return NextResponse.json({ error: 'The admin service hit an unexpected error. Check the server logs.' }, { status: 500 });
    }
  });
  response.headers.set('Cache-Control', 'no-store');
  return response;
}
