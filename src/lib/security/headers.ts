/**
 * Security Headers
 * 
 * Production-grade security headers for Next.js middleware.
 * Protects against XSS, clickjacking, MIME sniffing, and other attacks.
 */

import { NextResponse } from 'next/server';

/**
 * Content Security Policy (CSP)
 * Prevents XSS attacks by controlling allowed resource sources
 */
const isDev = process.env.NODE_ENV === 'development';

export const CSP_HEADER = [
  "default-src 'self'",
  isDev 
    ? "script-src 'self' 'unsafe-eval' 'unsafe-inline'" // unsafe-eval needed for Next.js dev HMR
    : "script-src 'self'",
  isDev
    ? "style-src 'self' 'unsafe-inline'" // unsafe-inline needed for styled-components in dev
    : "style-src 'self'",
  "img-src 'self' data: https: blob:",
  "font-src 'self' data:",
  "connect-src 'self' ws: wss:", // ws/wss for WebSocket and Socket.io
  "media-src 'self' blob:",
  "worker-src 'self' blob:",
  "frame-ancestors 'none'", // Prevent embedding in iframes
  "base-uri 'self'",
  "form-action 'self'",
  isDev ? "" : "upgrade-insecure-requests",
].filter(Boolean).join('; ');

/**
 * Strict Transport Security (HSTS)
 * Forces HTTPS connections
 */
export const HSTS_HEADER = 'max-age=31536000; includeSubDomains; preload';

/**
 * Security headers configuration
 */
export const SECURITY_HEADERS = {
  // Prevent MIME type sniffing
  'X-Content-Type-Options': 'nosniff',
  
  // Prevent clickjacking
  'X-Frame-Options': 'DENY',
  
  // XSS protection (legacy browsers)
  'X-XSS-Protection': '1; mode=block',
  
  // Referrer policy (privacy)
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  
  // Content Security Policy
  'Content-Security-Policy': CSP_HEADER,
  
  // Strict Transport Security (HTTPS only)
  // Only enable in production with HTTPS
  // 'Strict-Transport-Security': HSTS_HEADER,
  
  // Permissions policy (feature control)
  'Permissions-Policy': [
    'camera=()',
    'microphone=(self)', // Allow microphone for voice features
    'geolocation=()',
    'interest-cohort=()', // Disable FLoC tracking
  ].join(', '),
  
  // Cross-Origin policies
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Cross-Origin-Embedder-Policy': 'require-corp',
  'Cross-Origin-Resource-Policy': 'same-origin',
} as const;

/**
 * Apply security headers to response
 */
export function applySecurityHeaders(response: NextResponse): NextResponse {
  const headers = new Headers(response.headers);
  
  // Apply all security headers
  Object.entries(SECURITY_HEADERS).forEach(([key, value]) => {
    headers.set(key, value);
  });
  
  // Only add HSTS in production with HTTPS
  if (process.env.NODE_ENV === 'production' && process.env.HTTPS === 'true') {
    headers.set('Strict-Transport-Security', HSTS_HEADER);
  }
  
  return NextResponse.next({ request: { headers } });
}

/**
 * Create response with security headers
 */
export function createSecureResponse(
  body?: BodyInit | null,
  init?: ResponseInit
): NextResponse {
  const headers = new Headers(init?.headers);
  
  // Apply security headers
  Object.entries(SECURITY_HEADERS).forEach(([key, value]) => {
    headers.set(key, value);
  });
  
  // Only add HSTS in production with HTTPS
  if (process.env.NODE_ENV === 'production' && process.env.HTTPS === 'true') {
    headers.set('Strict-Transport-Security', HSTS_HEADER);
  }
  
  return NextResponse.json(body, { ...init, headers });
}

/**
 * CORS configuration for API routes
 */
export const CORS_HEADERS = {
  'Access-Control-Allow-Origin': process.env.ALLOWED_ORIGINS || 'http://localhost:3000',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Allow-Credentials': 'true',
  'Access-Control-Max-Age': '86400', // 24 hours
} as const;

/**
 * Apply CORS headers to response
 */
export function applyCorsHeaders(response: NextResponse): NextResponse {
  const headers = new Headers(response.headers);
  
  Object.entries(CORS_HEADERS).forEach(([key, value]) => {
    headers.set(key, value);
  });
  
  return NextResponse.next({ request: { headers } });
}

/**
 * Handle OPTIONS preflight request
 */
export function handleCorsPreFlight(): NextResponse {
  const headers = new Headers();
  
  Object.entries(CORS_HEADERS).forEach(([key, value]) => {
    headers.set(key, value);
  });
  
  return NextResponse.json(null, { status: 204, headers });
}
