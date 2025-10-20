/**
 * Authentication Middleware
 * Simple JWT-based authentication for API routes
 */

import { NextRequest, NextResponse } from 'next/server';

export interface AuthenticatedUser {
  id: string;
  email?: string;
  name?: string;
  role: 'user' | 'admin';
}

/**
 * Get user from request (stub - to be implemented with real auth)
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

    // TODO: Verify JWT token
    // For now, return a temp user if token exists
    if (token) {
      return {
        id: 'temp-user-id',
        email: 'user@example.com',
        name: 'Test User',
        role: 'user',
      };
    }

    return null;
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
