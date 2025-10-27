/**
 * Authentication Middleware
 * JWT-based authentication for API routes with Ed25519 signatures
 */

import { NextRequest, NextResponse } from 'next/server';
import { verifyJWT } from './jwt';
import { cookies } from 'next/headers';

export interface AuthenticatedUser {
  id: string;
  did?: string;
  email?: string;
  name?: string;
  role: 'user' | 'admin';
}

/**
 * Get user from request with Ed25519 JWT validation
 */
export async function getUserFromRequest(
  request: NextRequest
): Promise<AuthenticatedUser | null> {
  try {
    // Try to get token from httpOnly cookie first
    const cookieStore = await cookies();
    let token = cookieStore.get('accessToken')?.value;

    // Fallback to Authorization header for API clients
    if (!token) {
      const authHeader = request.headers.get('Authorization');
      if (authHeader?.startsWith('Bearer ')) {
        token = authHeader.substring(7);
      }
    }

    if (!token) {
      return null;
    }

    // Verify Ed25519-signed JWT token
    const payload = await verifyJWT(token);
    
    if (!payload || payload.type !== 'access') {
      return null;
    }
    
    return {
      id: payload.sub,
      did: payload.did,
      email: payload.email,
      name: payload.email?.split('@')[0],
      role: (payload.role as 'user' | 'admin') || 'user',
    };
  } catch (error) {
    console.error('Auth error:', error);
    return null;
  }
}

/**
 * Require authentication middleware
 */
export async function requireAuth(
  request: NextRequest,
  handler: (request: NextRequest, user: AuthenticatedUser) => Promise<NextResponse>
): Promise<NextResponse> {
  const user = await getUserFromRequest(request);

  if (!user) {
    return NextResponse.json(
      { error: 'Unauthorized', message: 'Authentication required' },
      { status: 401 }
    );
  }

  return handler(request, user);
}

/**
 * Require admin role
 */
export async function requireAdmin(
  request: NextRequest,
  handler: (request: NextRequest, user: AuthenticatedUser) => Promise<NextResponse>
): Promise<NextResponse> {
  const user = await getUserFromRequest(request);

  if (!user) {
    return NextResponse.json(
      { error: 'Unauthorized', message: 'Authentication required' },
      { status: 401 }
    );
  }

  if (user.role !== 'admin') {
    return NextResponse.json(
      { error: 'Forbidden', message: 'Admin access required' },
      { status: 403 }
    );
  }

  return handler(request, user);
}

/**
 * Optional auth - provides user if authenticated, but doesn't require it
 */
export async function optionalAuth(
  request: NextRequest,
  handler: (request: NextRequest, user: AuthenticatedUser | null) => Promise<NextResponse>
): Promise<NextResponse> {
  const user = await getUserFromRequest(request);
  return handler(request, user);
}
