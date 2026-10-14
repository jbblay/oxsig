import { clerkMiddleware } from '@clerk/nextjs/server';
import { NextResponse, type NextFetchEvent, type NextRequest } from 'next/server';
import { applySecurityHeaders } from '@/lib/security/headers';
import { isProductionDeployment } from '@/lib/runtime/deployment-environment';

/**
 * Clerk rejects session tokens whose `azp` claim is not an authorized party.
 * Behind a TLS-terminating load balancer (AWS ALB/CloudFront) the request URL
 * seen by the app can differ from the public origin (scheme or host), so the
 * configured public URL is always authorized in addition to the request origin.
 */
function authorizedParties(request: NextRequest): string[] {
  const parties = new Set<string>([new URL(request.url).origin]);
  for (const candidate of [process.env.OXSIG_APP_URL]) {
    if (!candidate) continue;
    try {
      parties.add(new URL(candidate).origin);
    } catch {
      // Ignore malformed configuration; the env contract check reports it.
    }
  }
  return [...parties];
}

const withClerk = clerkMiddleware(
  async (_auth, request) => {
    const legacyBoardInvite = request.nextUrl.pathname.match(/^\/collab\/storyboards\/invite\/([^/]+)$/);
    if (legacyBoardInvite) {
      const destination = request.nextUrl.clone();
      destination.pathname = `/board-invite/${legacyBoardInvite[1]}`;
      return applySecurityHeaders(NextResponse.redirect(destination), undefined, false);
    }
    return applySecurityHeaders(NextResponse.next(), undefined, false);
  },
  (request) => ({
    authorizedParties: authorizedParties(request as NextRequest),
    contentSecurityPolicy: {
      strict: true,
      directives: {
        'img-src': ['data:', 'blob:', 'https:'],
        'font-src': ["'self'", 'data:'],
        'media-src': ["'self'", 'blob:'],
        'frame-ancestors': ["'none'"],
        'base-uri': ["'self'"],
      },
    },
  })
);

export default function middleware(request: NextRequest, event: NextFetchEvent) {
  if (process.env.OXSIG_E2E_AUTH_ENABLED === 'true') {
    if (process.env.NODE_ENV === 'production' || isProductionDeployment()) {
      throw new Error('OXSIG_E2E_AUTH_ENABLED is forbidden in production.');
    }

    // Browser regressions use the deterministic E2E identity cookie in API auth.
    // Bypass Clerk only in this explicitly non-production mode so dummy Clerk
    // credentials cannot trigger Clerk's development proxy during test startup.
    return applySecurityHeaders(NextResponse.next(), undefined, false);
  }

  return withClerk(request, event);
}

export const config = {
  matcher: [
    // The terminal bridge performs its own same-origin + one-time ticket auth and
    // must reach Vercel's WebSocket upgrade route without edge middleware handling.
    '/((?!_next|__oxsig|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)',
    '/(api|trpc)(.*)',
    '/__clerk/(.*)',
  ],
};
