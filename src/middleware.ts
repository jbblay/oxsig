/**
 * Next.js Middleware for JWT Authentication and Security
 *
 * Applies security headers and prevents unauthenticated access to protected
 * routes. Cryptographic JWT validation remains inside protected API handlers.
 */

import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import {
  applySecurityHeaders,
  buildContentSecurityPolicy,
} from '@/lib/security/headers';

const PROTECTED_ROUTES = [
  '/api/documents',
  '/api/signatures',
  '/api/users',
  '/profile',
  '/vault',
  '/sign',
  '/signature-editor',
];

const PUBLIC_ROUTES = [
  '/api/auth/login',
  '/api/auth/register',
  '/api/auth/refresh',
  '/api/auth/logout',
  '/api/health',
];

function isProtectedRoute(pathname: string): boolean {
  return PROTECTED_ROUTES.some((route) => pathname.startsWith(route));
}

function isPublicRoute(pathname: string): boolean {
  return PUBLIC_ROUTES.some((route) => pathname.startsWith(route));
}

export async function middleware(request: NextRequest) {
  const { pathname } = new URL(request.url);
  const nonce = btoa(crypto.randomUUID());
  const contentSecurityPolicy = buildContentSecurityPolicy(nonce);
  const requestHeaders = new Headers(request.headers);

  requestHeaders.set('x-nonce', nonce);
  requestHeaders.set('Content-Security-Policy', contentSecurityPolicy);

  const nextResponse = () =>
    NextResponse.next({
      request: { headers: requestHeaders },
    });

  if (isPublicRoute(pathname)) {
    return applySecurityHeaders(nextResponse(), contentSecurityPolicy);
  }

  if (!isProtectedRoute(pathname)) {
    return applySecurityHeaders(nextResponse(), contentSecurityPolicy);
  }

  const token = request.cookies.get('accessToken')?.value;

  if (!token) {
    if (pathname.startsWith('/api/')) {
      const response = NextResponse.json(
        { error: 'Unauthorized', message: 'No authentication token provided' },
        { status: 401 }
      );
      return applySecurityHeaders(response, contentSecurityPolicy);
    }

    const loginUrl = new URL('/', request.url);
    loginUrl.searchParams.set('redirect', pathname);
    const response = NextResponse.redirect(loginUrl);
    return applySecurityHeaders(response, contentSecurityPolicy);
  }

  return applySecurityHeaders(nextResponse(), contentSecurityPolicy);
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};
