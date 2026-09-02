/**
 * Authentication boundary for API routes.
 *
 * Clerk is the preferred interactive identity provider when configured. OxSig
 * resolves Clerk's external user ID to the existing internal UUID user record.
 * Legacy Ed25519 JWT authentication remains available during the migration so
 * existing sessions and DID flows can be retired deliberately rather than in
 * one breaking cutover.
 */

import { NextRequest, NextResponse } from 'next/server';
import { verifyJWT } from './jwt';
import { cookies } from 'next/headers';
import { getClerkAuthenticatedUser, isClerkConfigured } from './clerk-user';

export interface AuthenticatedUser {
  id: string;
  did?: string;
  email?: string;
  name?: string;
  role: 'user' | 'admin';
}

async function getLegacyUserFromRequest(
  request: NextRequest
): Promise<AuthenticatedUser | null> {
  const cookieStore = await cookies();
  let token = cookieStore.get('accessToken')?.value;

  if (!token) {
    const authHeader = request.headers.get('Authorization');
    if (authHeader?.startsWith('Bearer ')) {
      token = authHeader.substring(7);
    }
  }

  if (!token) return null;

  const payload = await verifyJWT(token);
  if (!payload || payload.type !== 'access') return null;

  return {
    id: payload.sub,
    did: payload.did,
    email: payload.email,
    name: payload.email?.split('@')[0],
    role: (payload.role as 'user' | 'admin') || 'user',
  };
}

/**
 * Resolve the authenticated request to OxSig's internal UUID user.
 */
export async function getUserFromRequest(
  request: NextRequest
): Promise<AuthenticatedUser | null> {
  try {
    if (isClerkConfigured()) {
      const clerkUser = await getClerkAuthenticatedUser();
      if (clerkUser) {
        return {
          id: clerkUser.id,
          did: clerkUser.did,
          email: clerkUser.email,
          name: clerkUser.name,
          role: clerkUser.role,
        };
      }
    }

    // Transitional fallback. Remove after Clerk migration is complete and all
    // legacy sessions/DID login flows have a defined replacement.
    return await getLegacyUserFromRequest(request);
  } catch (error) {
    console.error('Auth error:', error);
    return null;
  }
}

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

  // Authorization stays in OxSig/Neon. A Clerk session never grants an OxSig
  // admin role by itself.
  if (user.role !== 'admin') {
    return NextResponse.json(
      { error: 'Forbidden', message: 'Admin access required' },
      { status: 403 }
    );
  }

  return handler(request, user);
}

export async function optionalAuth(
  request: NextRequest,
  handler: (request: NextRequest, user: AuthenticatedUser | null) => Promise<NextResponse>
): Promise<NextResponse> {
  const user = await getUserFromRequest(request);
  return handler(request, user);
}
