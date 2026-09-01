/**
 * Next.js Middleware for JWT Authentication and Security
 * 
 * Protects routes by verifying JWT tokens from cookies
 * Applies security headers to all responses
 */

import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { cookies } from 'next/headers';
import {
  applySecurityHeaders,
  buildContentSecurityPolicy,
} from '@/lib/security/headers';

// Routes that require authentication
const PROTECTED_ROUTES = [
  '/api/documents',
  '/api/signatures',
  '/api/users',
  '/profile',
  '/vault',
  '/sign',
  '/signature-editor',
];

// Routes that should be accessible without auth
const PUBLIC_ROUTES = [
  '/api/auth/login',
  '/api/auth/register',
  '/api/health',
  '/auth-test',
  '/backend-test',
];

/**
 * Check if route requires authentication
 */
function isProtectedRoute(pathname: string): boolean {
  return PROTECTED_ROUTES.some(route => pathname.startsWith(route));
}

/**
 * Check if route is public
 */
function isPublicRoute(pathname: string): boolean {
  return PUBLIC_ROUTES.some(route => pathname.startsWith(route));
}

export async function middleware(request: NextRequest) {
  const { pathname } = new URL(request.url);
  const nonce = btoa(crypto.randomUUID());
  const contentSecurityPolicy = buildContentSecurityPolicy(nonce);
  const requestHeaders = new Headers(request.headers);

  // Next.js reads the nonce from the incoming CSP and applies it to its
  // framework/bootstrap scripts during server rendering.
  requestHeaders.set('x-nonce', nonce);
  requestHeaders.set('Content-Security-Policy', contentSecurityPolicy);

  const nextResponse = () =>
    NextResponse.next({
      request: { headers: requestHeaders },
    });
  
  // Skip public routes
  if (isPublicRoute(pathname)) {
    return applySecurityHeaders(nextResponse(), contentSecurityPolicy);
  }
  
  // Check if route requires authentication
  if (!isProtectedRoute(pathname)) {
    return applySecurityHeaders(nextResponse(), contentSecurityPolicy);
  }
  
  // Get token from cookie
  const cookieStore = await cookies();
  const token = cookieStore.get('accessToken')?.value;
  
  if (!token) {
    // No token - redirect to login or return 401 for API routes
    if (pathname.startsWith('/api/')) {
      const response = NextResponse.json(
        { error: 'Unauthorized', message: 'No authentication token provided' },
        { status: 401 }
      );
      return applySecurityHeaders(response, contentSecurityPolicy);
    }
    
    // Redirect to auth test page for UI routes
    const loginUrl = new URL('/auth-test', request.url);
    loginUrl.searchParams.set('redirect', pathname);
    const response = NextResponse.redirect(loginUrl);
    return applySecurityHeaders(response, contentSecurityPolicy);
  }
  
  // Verify token (we'll add actual verification in the API routes)
  // For now, just check if token exists
  // Note: Full verification happens in API routes using verifyJWT
  
  return applySecurityHeaders(nextResponse(), contentSecurityPolicy);
}

// Configure which routes middleware runs on
export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - public folder
     */
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};
