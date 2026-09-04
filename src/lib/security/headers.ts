/**
 * Security Headers
 *
 * Production-grade security headers for Next.js middleware.
 * Protects against XSS, clickjacking, MIME sniffing, and other attacks.
 */

import { NextResponse } from 'next/server';

/**
 * Content Security Policy (CSP)
 * Prevents XSS attacks by controlling allowed resource sources.
 *
 * This policy remains the fallback for legacy/local mode. When Clerk is
 * configured, Clerk's strict CSP middleware owns the CSP header and nonce so
 * it can safely include the instance-specific Clerk/FAPI protection domains.
 */
const isDev = process.env.NODE_ENV === 'development';

export function buildContentSecurityPolicy(nonce?: string): string {
  const scriptSource = isDev
    ? "script-src 'self' 'unsafe-eval' 'unsafe-inline'"
    : nonce
      ? `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'`
      : "script-src 'self'";

  return [
    "default-src 'self'",
    scriptSource,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: https: blob:",
    "font-src 'self' data:",
    "connect-src 'self' ws: wss:",
    "media-src 'self' blob:",
    "worker-src 'self' blob:",
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    isDev ? "" : "upgrade-insecure-requests",
  ].filter(Boolean).join('; ');
}

export const CSP_HEADER = buildContentSecurityPolicy();
export const HSTS_HEADER = 'max-age=31536000; includeSubDomains; preload';

export const SECURITY_HEADERS = {
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'X-XSS-Protection': '1; mode=block',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Permissions-Policy': [
    'camera=()',
    'microphone=(self)',
    'geolocation=()',
    'interest-cohort=()',
  ].join(', '),
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Cross-Origin-Embedder-Policy': 'require-corp',
  'Cross-Origin-Resource-Policy': 'same-origin',
} as const;

/**
 * Apply OxSig's non-CSP security headers to an existing response. CSP is
 * optionally applied because Clerk's strict CSP integration must be allowed to
 * generate and own its instance-aware policy when Clerk is enabled.
 */
export function applySecurityHeaders(
  response: NextResponse,
  contentSecurityPolicy = CSP_HEADER,
  includeContentSecurityPolicy = true
): NextResponse {
  Object.entries(SECURITY_HEADERS).forEach(([key, value]) => {
    response.headers.set(key, value);
  });

  if (includeContentSecurityPolicy) {
    response.headers.set('Content-Security-Policy', contentSecurityPolicy);
  }

  // Production deployments are HTTPS-only at the edge. Requiring a separate
  // HTTPS=true environment flag made HSTS easy to omit accidentally. Browsers
  // ignore HSTS received over plain HTTP, so applying it for every production
  // response is both safe and deterministic.
  if (process.env.NODE_ENV === 'production') {
    response.headers.set('Strict-Transport-Security', HSTS_HEADER);
  }

  return response;
}

export function createSecureResponse(
  body?: BodyInit | null,
  init?: ResponseInit
): NextResponse {
  const response = NextResponse.json(body, init);
  return applySecurityHeaders(response);
}

export const CORS_HEADERS = {
  'Access-Control-Allow-Origin': process.env.ALLOWED_ORIGINS || 'http://localhost:3000',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Allow-Credentials': 'true',
  'Access-Control-Max-Age': '86400',
} as const;

export function applyCorsHeaders(response: NextResponse): NextResponse {
  Object.entries(CORS_HEADERS).forEach(([key, value]) => {
    response.headers.set(key, value);
  });

  return response;
}

export function handleCorsPreFlight(): NextResponse {
  const response = new NextResponse(null, { status: 204 });
  return applyCorsHeaders(response);
}
