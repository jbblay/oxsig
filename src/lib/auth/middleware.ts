/**
 * Authentication Middleware
 * JWT-based authentication for API routes with Ed25519 signatures
 */

import { NextRequest, NextResponse } from 'next/server';
import { extractBearerToken, verifyJWT } from './jwt';

export interface AuthenticatedUser {
  id: string;
  did?: string;
  email?: string;
  name?: string;
  role: 'user' | 'admin' | 'moderator';
}

/**
 * Get user from request with Ed25519 JWT validation
 */
export async function getUserFromRequest(
  request: NextRequest
): Promise<AuthenticatedUser | null> {
  try {
    const token = request.cookies.get('accessToken')?.value
      ?? extractBearerToken(request.headers.get('authorization'));

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
      role: payload.role === 'admin' || payload.role === 'moderator' ? payload.role : 'user',
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
