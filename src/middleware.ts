import { clerkMiddleware } from '@clerk/nextjs/server';
import { NextResponse } from 'next/server';
import { applySecurityHeaders } from '@/lib/security/headers';

export default clerkMiddleware(
  async () => applySecurityHeaders(NextResponse.next(), undefined, false),
  (request) => ({
    authorizedParties: [new URL(request.url).origin],
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

export const config = {
  matcher: [
    // The terminal bridge performs its own same-origin + one-time ticket auth and
    // must reach Vercel's WebSocket upgrade route without edge middleware handling.
    '/((?!_next|__oxsig|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)',
    '/(api|trpc)(.*)',
    '/__clerk/(.*)',
  ],
};
