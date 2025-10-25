/**
 * JWT Verification Utilities for API Route Protection
 * 
 * Provides middleware-style helpers to verify JWT tokens
 * and extract user information from authenticated requests.
 */

import { NextRequest, NextResponse } from 'next/server';
import { verifyJWT, type JWTPayload } from './jwt';
import { cookies } from 'next/headers';

export interface AuthenticatedRequest extends NextRequest {
  user?: {
    id: string;
    email?: string;
  };
}

/**
 * Extract JWT token from httpOnly cookie
 */
export async function getTokenFromCookies(): Promise<string | null> {
  const cookieStore = await cookies();
  return cookieStore.get('accessToken')?.value || null;
}

/**
 * Verify JWT token and return payload
 */
export async function verifyAuthToken(token: string): Promise<JWTPayload | null> {
  return verifyJWT(token);
}

/**
 * Require authentication for API route
 * Returns user payload if authenticated, or error response if not
 */
export async function requireAuth(
  request: NextRequest
): Promise<{ user: { id: string; email?: string } } | NextResponse> {
  // Try cookie first (httpOnly)
  const token = await getTokenFromCookies();
  
  if (!token) {
    return NextResponse.json(
      { error: 'Unauthorized', message: 'Authentication required' },
      { status: 401 }
    );
  }

  const payload = await verifyAuthToken(token);

  if (!payload || payload.type !== 'access') {
    return NextResponse.json(
      { error: 'Unauthorized', message: 'Invalid or expired token' },
      { status: 401 }
    );
  }

  return {
    user: {
      id: payload.sub,
      email: payload.email,
    },
  };
}

/**
 * Optional authentication - returns user if token is valid, undefined if not
 * Does not return error response, just undefined
 */
export async function optionalAuth(): Promise<{ id: string; email?: string } | undefined> {
  const token = await getTokenFromCookies();
  
  if (!token) {
    return undefined;
  }

  const payload = await verifyAuthToken(token);

  if (!payload || payload.type !== 'access') {
    return undefined;
  }

  return {
    id: payload.sub,
    email: payload.email,
  };
}

/**
 * Check if request has valid authentication
 */
export async function isAuthenticated(): Promise<boolean> {
  const user = await optionalAuth();
  return !!user;
}
