/**
 * Next.js Middleware for JWT Authentication
 * 
 * Protects routes by verifying JWT tokens from cookies
 */

import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

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
  const { pathname } = request.nextUrl;
  
  // Skip public routes
  if (isPublicRoute(pathname)) {
    return NextResponse.next();
  }
  
  // Check if route requires authentication
  if (!isProtectedRoute(pathname)) {
    return NextResponse.next();
  }
  
  // Get token from cookie
  const token = request.cookies.get('accessToken')?.value;
  
  if (!token) {
    // No token - redirect to login or return 401 for API routes
    if (pathname.startsWith('/api/')) {
      return NextResponse.json(
        { error: 'Unauthorized', message: 'No authentication token provided' },
        { status: 401 }
      );
    }
    
    // Redirect to auth test page for UI routes
    const loginUrl = new URL('/auth-test', request.url);
    loginUrl.searchParams.set('redirect', pathname);
    return NextResponse.redirect(loginUrl);
  }
  
  // Verify token (we'll add actual verification in the API routes)
  // For now, just check if token exists
  // Note: Full verification happens in API routes using verifyJWT
  
  return NextResponse.next();
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
