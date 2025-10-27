/**
 * CSRF (Cross-Site Request Forgery) Protection
 * 
 * Implements double-submit cookie pattern for CSRF protection.
 * Generates and validates CSRF tokens for state-changing operations.
 */

import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { randomBytes } from 'crypto';

const CSRF_TOKEN_LENGTH = 32;
const CSRF_COOKIE_NAME = 'csrf-token';
const CSRF_HEADER_NAME = 'x-csrf-token';

/**
 * Generate a secure CSRF token
 */
export function generateCsrfToken(): string {
  return randomBytes(CSRF_TOKEN_LENGTH).toString('hex');
}

/**
 * Validate CSRF token from request
 * Compares token from header/body with token from cookie
 */
export async function validateCsrfToken(request: NextRequest): Promise<boolean> {
  // Get token from cookie
  const cookieStore = await cookies();
  const cookieToken = cookieStore.get(CSRF_COOKIE_NAME)?.value;
  
  if (!cookieToken) {
    return false;
  }
  
  // Get token from header (preferred) or request body
  let requestToken = request.headers.get(CSRF_HEADER_NAME);
  
  if (!requestToken) {
    return false;
  }
  
  // Constant-time comparison to prevent timing attacks
  return timingSafeEqual(cookieToken, requestToken);
}

/**
 * Timing-safe string comparison
 * Prevents timing attacks by ensuring comparison takes constant time
 */
function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) {
    return false;
  }
  
  let result = 0;
  for (let i = 0; i < a.length; i++) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  
  return result === 0;
}

/**
 * Set CSRF token in response cookie
 */
export async function setCsrfCookie(response: NextResponse, token?: string): Promise<void> {
  const csrfToken = token || generateCsrfToken();
  
  response.cookies.set(CSRF_COOKIE_NAME, csrfToken, {
    httpOnly: false, // Must be accessible to JavaScript
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    maxAge: 60 * 60 * 24, // 24 hours
    path: '/',
  });
}

/**
 * Get CSRF token from request cookie
 */
export async function getCsrfToken(request: NextRequest): Promise<string | null> {
  const cookieStore = await cookies();
  return cookieStore.get(CSRF_COOKIE_NAME)?.value || null;
}

/**
 * CSRF middleware wrapper for API routes
 * Only validates CSRF for state-changing methods (POST, PUT, PATCH, DELETE)
 */
export function withCsrfProtection(
  handler: (request: NextRequest) => Promise<NextResponse>
) {
  return async (request: NextRequest): Promise<NextResponse> => {
    const method = request.method;
    
    // Only validate CSRF for state-changing methods
    const requiresCsrf = ['POST', 'PUT', 'PATCH', 'DELETE'].includes(method);
    
    if (requiresCsrf) {
      const isValid = await validateCsrfToken(request);
      
      if (!isValid) {
        return NextResponse.json(
          {
            error: 'CSRF validation failed',
            message: 'Invalid or missing CSRF token',
          },
          { status: 403 }
        );
      }
    }
    
    return handler(request);
  };
}

/**
 * Combined middleware: CSRF + Rate Limiting
 */
export function withCsrfAndRateLimit(
  handler: (request: NextRequest) => Promise<NextResponse>,
  rateLimitConfig?: { maxRequests: number; windowMs: number }
) {
  return async (request: NextRequest): Promise<NextResponse> => {
    // 1. Check rate limit first
    if (rateLimitConfig) {
      const { checkRateLimit } = await import('./rate-limit');
      const rateLimitResponse = await checkRateLimit(request, rateLimitConfig);
      if (rateLimitResponse) {
        return rateLimitResponse;
      }
    }
    
    // 2. Check CSRF for state-changing methods
    const method = request.method;
    const requiresCsrf = ['POST', 'PUT', 'PATCH', 'DELETE'].includes(method);
    
    if (requiresCsrf) {
      const isValid = await validateCsrfToken(request);
      
      if (!isValid) {
        return NextResponse.json(
          {
            error: 'CSRF validation failed',
            message: 'Invalid or missing CSRF token',
          },
          { status: 403 }
        );
      }
    }
    
    // 3. Call handler
    return handler(request);
  };
}

/**
 * API route to get CSRF token
 * GET /api/csrf-token
 */
export async function handleGetCsrfToken(request: NextRequest): Promise<NextResponse> {
  let token = await getCsrfToken(request);
  
  // Generate new token if not exists
  if (!token) {
    token = generateCsrfToken();
  }
  
  const response = NextResponse.json({
    token,
  });
  
  await setCsrfCookie(response, token);
  
  return response;
}

/**
 * Extract CSRF token from various sources for form submissions
 */
export async function extractCsrfToken(request: NextRequest): Promise<string | null> {
  // 1. Check header (preferred method)
  const headerToken = request.headers.get(CSRF_HEADER_NAME);
  if (headerToken) return headerToken;
  
  // 2. For form data or JSON body, we need to parse carefully
  // Note: This consumes the request body, so use sparingly
  try {
    const contentType = request.headers.get('content-type');
    
    if (contentType?.includes('application/json')) {
      const body = await request.json();
      if (body?.csrf_token) return body.csrf_token;
    }
  } catch (error) {
    // Ignore parsing errors - body may have already been consumed
  }
  
  return null;
}

/**
 * Constants for easy import
 */
export const CSRF = {
  COOKIE_NAME: CSRF_COOKIE_NAME,
  HEADER_NAME: CSRF_HEADER_NAME,
  TOKEN_LENGTH: CSRF_TOKEN_LENGTH,
} as const;
