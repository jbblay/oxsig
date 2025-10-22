/**
 * Authentication Middleware
 * JWT-based authentication for API routes
 */

import { NextRequest, NextResponse } from 'next/server';
import * as jose from 'jose';

export interface AuthenticatedUser {
  id: string;
  email?: string;
  name?: string;
  role: 'user' | 'admin';
}

/**
 * Verify JWT token
 */
async function verifyToken(token: string): Promise<jose.JWTPayload> {
  const secret = new TextEncoder().encode(
    process.env.JWT_SECRET || 'your_secret_key_here_change_in_production'
  );

  const { payload } = await jose.jwtVerify(token, secret);
  return payload;
}

/**
 * Get user from request with real JWT validation
 */
export async function getUserFromRequest(
  request: NextRequest
): Promise<AuthenticatedUser | null> {
  try {
    // Check Authorization header
    const authHeader = request.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return null;
    }

    const token = authHeader.substring(7);

    // Verify JWT token
    try {
      const payload = await verifyToken(token);
      
      return {
        id: payload.sub as string,
        email: payload.email as string,
        name: payload.name as string,
        role: (payload.role as 'user' | 'admin') || 'user',
      };
    } catch (error) {
      console.error('Token verification failed:', error);
      return null;
    }
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
