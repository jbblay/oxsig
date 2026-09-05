import { NextRequest, NextResponse } from 'next/server';
import { getClerkAuthenticatedUser } from './clerk-user';

export interface AuthenticatedUser {
  id: string;
  clerkUserId?: string;
  did?: string;
  email?: string;
  name?: string;
  role: 'user' | 'admin';
}

export async function getUserFromRequest(_request: NextRequest): Promise<AuthenticatedUser | null> {
  const clerkUser = await getClerkAuthenticatedUser();
  if (!clerkUser) return null;
  return {
    id: clerkUser.id,
    clerkUserId: clerkUser.clerkUserId,
    did: clerkUser.did,
    email: clerkUser.email,
    name: clerkUser.name,
    role: clerkUser.role,
  };
}

async function resolveUser(request: NextRequest): Promise<{ user: AuthenticatedUser | null; error?: NextResponse }> {
  try {
    return { user: await getUserFromRequest(request) };
  } catch (error) {
    console.error('Authenticated user resolution failed:', error);
    return { user: null, error: NextResponse.json({ error: 'Account service unavailable' }, { status: 503 }) };
  }
}

export async function requireAuth(
  request: NextRequest,
  handler: (request: NextRequest, user: AuthenticatedUser) => Promise<NextResponse>
): Promise<NextResponse> {
  const resolved = await resolveUser(request);
  if (resolved.error) return resolved.error;
  if (!resolved.user) return NextResponse.json({ error: 'Unauthorized', message: 'Authentication required' }, { status: 401 });
  return handler(request, resolved.user);
}

export async function requireAdmin(
  request: NextRequest,
  handler: (request: NextRequest, user: AuthenticatedUser) => Promise<NextResponse>
): Promise<NextResponse> {
  const resolved = await resolveUser(request);
  if (resolved.error) return resolved.error;
  if (!resolved.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (resolved.user.role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  return handler(request, resolved.user);
}

export async function optionalAuth(
  request: NextRequest,
  handler: (request: NextRequest, user: AuthenticatedUser | null) => Promise<NextResponse>
): Promise<NextResponse> {
  const resolved = await resolveUser(request);
  if (resolved.error) return resolved.error;
  return handler(request, resolved.user);
}
