import { NextRequest, NextResponse } from 'next/server';
import { hasDemoSession } from '@/lib/auth/demo';
import { extractBearerToken, verifyJWT } from '@/lib/auth/jwt';
import { applySecurityHeaders } from '@/lib/security/headers';

const PROTECTED_PAGES = [
  '/home',
  '/sign',
  '/profile',
];

function isPublicApi(pathname: string): boolean {
  return pathname.startsWith('/api/auth/') || pathname === '/api/health';
}

function isProtectedPage(pathname: string): boolean {
  return PROTECTED_PAGES.some((route) => pathname === route || pathname.startsWith(`${route}/`));
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const apiRequest = pathname.startsWith('/api/');
  const protectedRequest = (apiRequest && !isPublicApi(pathname)) || isProtectedPage(pathname);

  if (!protectedRequest) return applySecurityHeaders(NextResponse.next());

  if (hasDemoSession(request)) {
    return applySecurityHeaders(NextResponse.next());
  }

  const accessToken = request.cookies.get('accessToken')?.value
    ?? extractBearerToken(request.headers.get('authorization'));
  const payload = accessToken ? await verifyJWT(accessToken) : null;

  if (payload?.type === 'access') {
    return applySecurityHeaders(NextResponse.next());
  }

  if (apiRequest) {
    return applySecurityHeaders(NextResponse.json(
      { error: 'Unauthorized', message: 'A valid access token is required' },
      { status: 401 },
    ));
  }

  // Let the authenticated client refresh an expired access token in place.
  if (request.cookies.has('refreshToken')) {
    const response = NextResponse.next();
    response.cookies.delete('accessToken');
    return applySecurityHeaders(response);
  }

  const loginUrl = new URL('/', request.url);
  loginUrl.searchParams.set('redirect', pathname);
  return applySecurityHeaders(NextResponse.redirect(loginUrl));
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|webmanifest)$).*)',
  ],
};
