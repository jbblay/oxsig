/**
 * Next.js middleware for Clerk integration and security headers.
 *
 * Resource-level API authorization remains inside route handlers. Middleware
 * supplies Clerk request context, protects browser pages, and preserves OxSig's
 * non-CSP security headers. Clerk owns the CSP/nonce when configured so its
 * instance-specific FAPI and fraud-protection domains remain correct.
 */

import { clerkMiddleware } from '@clerk/nextjs/server';
import { NextResponse } from 'next/server';
import type { NextFetchEvent } from 'next/server';
import type { NextRequest } from 'next/dist/server/web/spec-extension/request';
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

function legacySecurityContext(request: NextRequest) {
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
  const { contentSecurityPolicy, nextResponse } = legacySecurityContext(request);

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

    // Protect browser pages here for navigation UX. APIs are intentionally
    // enforced again at the data boundary by requireAuth()/requireAdmin().
    if (!pathname.startsWith('/api/') && isProtectedRoute(pathname) && !isPublicRoute(pathname)) {
      const { isAuthenticated, redirectToSignIn } = await auth();
      if (!isAuthenticated) {
        const redirect = redirectToSignIn({ returnBackUrl: request.url });
        return applySecurityHeaders(redirect, undefined, false);
      }
    }

    return applySecurityHeaders(NextResponse.next(), undefined, false);
  },
  (request) => ({
    authorizedParties: [new URL(request.url).origin],
    contentSecurityPolicy: {
      strict: true,
      directives: {
        'connect-src': ['ws:', 'wss:'],
        'img-src': ['data:', 'blob:', 'https:'],
        'font-src': ["'self'", 'data:'],
        'media-src': ["'self'", 'blob:'],
        'frame-ancestors': ["'none'"],
        'base-uri': ["'self'"],
      },
    },
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
