import { NextResponse } from 'next/server';

const isDev = process.env.NODE_ENV === 'development';
const contentSecurityPolicy = [
  "default-src 'self'",
  isDev
    ? "script-src 'self' 'unsafe-eval' 'unsafe-inline'"
    : "script-src 'self' 'unsafe-inline'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  isDev ? "connect-src 'self' ws: wss:" : "connect-src 'self'",
  "object-src 'none'",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
].join('; ');

const securityHeaders = {
  'Content-Security-Policy': contentSecurityPolicy,
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Cross-Origin-Resource-Policy': 'same-origin',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'X-XSS-Protection': '0',
} as const;

export function applySecurityHeaders(response: NextResponse): NextResponse {
  for (const [key, value] of Object.entries(securityHeaders)) {
    response.headers.set(key, value);
  }
  if (process.env.NODE_ENV === 'production' && process.env.HTTPS === 'true') {
    response.headers.set('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  }
  return response;
}
