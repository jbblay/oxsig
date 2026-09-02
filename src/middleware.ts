/**
 * Next.js middleware for Clerk integration and security headers.
 *
 * Resource-level API authorization remains inside route handlers. Middleware
 * supplies Clerk request context, protects browser pages, and preserves the
 * existing CSP/security headers. Legacy cookie gating remains only as a
 * migration fallback when Clerk is not configured.
 */

import { clerkMiddleware } from '@clerk/nextjs/server';
import { NextResponse } from 'next/server';
import type { NextFetchEvent, NextRequest } from 'next/server';
import {
  applySecurityHeaders,
  buildContentSecurityPolicy,
} from '@/lib/security/headers';

const PROTECTED_ROUTES = [
  '/api/documents',
  '/api/users',
  '/api/storyboards',
  '/api/labs',
  '/api/collaborations',
  '/api/storage',
  '/api/search',
  '/api/recovery',
  '/api/webauthn',
  '/home',
  '/account',
  '/profile',
  '/vault',
  '/storage',
  '/collab',
  '/labs',
  '/security',
  '/audit',
  '/opsec',
  '/network',
  '/identity',
  '/privacy',
  '/architecture',
  '/offline',
  '/sharedocs',
];

const PUBLIC_ROUTES = [
  '/api/auth/login',
  '/api/auth/register',
  '/api/auth/refresh',
  '/api/auth/logout',
  '/api/auth/did',
  '/api/csrf-token',
  '/api/health',
  '/api/webhooks/clerk',
  '/sign-in',
  '/sign-up',
];

function isProtectedRoute(pathname: string): boolean {
  return PROTECTED_ROUTES.some((route) => pathname.startsWith(route));
}

function isPublicRoute(pathname: string): boolean {
  return PUBLIC_ROUTES.some((route) => pathname.startsWith(route));
}

function clerkIsConfigured(): boolean {
  return Boolean(
    process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY && process.env.CLERK_SECRET_KEY
  );
}

function securityContext(request: NextRequest) {
  const nonce = btoa(crypto.randomUUID());
  const contentSecurityPolicy = buildContentSecurityPolicy(nonce);
  const requestHeaders = new Headers(request.headers);

  requestHeaders.set('x-nonce', nonce);
  requestHeaders.set('Content-Security-Policy', contentSecurityPolicy);

  return {
    contentSecurityPolicy,
    nextResponse: () =>
      NextResponse.next({
        request: { headers: requestHeaders },
      }),
  };
}

async function legacyMiddleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const { contentSecurityPolicy, nextResponse } = securityContext(request);

  if (isPublicRoute(pathname) || !isProtectedRoute(pathname)) {
    return applySecurityHeaders(nextResponse(), contentSecurityPolicy);
  }

  const token = request.cookies.get('accessToken')?.value;
  if (!token) {
    if (pathname.startsWith('/api/')) {
      return applySecurityHeaders(
        NextResponse.json(
          { error: 'Unauthorized', message: 'No authentication token provided' },
          { status: 401 }
        ),
        contentSecurityPolicy
      );
    }

    const loginUrl = new URL('/', request.url);
    loginUrl.searchParams.set('redirect', pathname);
    return applySecurityHeaders(NextResponse.redirect(loginUrl), contentSecurityPolicy);
  }

  return applySecurityHeaders(nextResponse(), contentSecurityPolicy);
}

const clerkRequestMiddleware = clerkMiddleware(
  async (auth, request) => {
    const { pathname } = request.nextUrl;
    const { contentSecurityPolicy, nextResponse } = securityContext(request);

    // API routes enforce authentication at the resource itself through
    // requireAuth()/requireAdmin(). The Clerk webhook must remain public.
    if (!pathname.startsWith('/api/') && isProtectedRoute(pathname) && !isPublicRoute(pathname)) {
      const { isAuthenticated, redirectToSignIn } = await auth();
      if (!isAuthenticated) {
        const redirect = redirectToSignIn({ returnBackUrl: request.url });
        return applySecurityHeaders(redirect, contentSecurityPolicy);
      }
    }

    return applySecurityHeaders(nextResponse(), contentSecurityPolicy);
  },
  (request) => ({
    authorizedParties: [request.nextUrl.origin],
  })
);

export default async function middleware(request: NextRequest, event: NextFetchEvent) {
  if (clerkIsConfigured()) {
    return clerkRequestMiddleware(request, event);
  }

  return legacyMiddleware(request);
}

export const config = {
  matcher: [
    '/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)',
    '/(api|trpc)(.*)',
    '/__clerk/(.*)',
  ],
};
