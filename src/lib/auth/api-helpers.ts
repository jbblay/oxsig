/**
 * API Route Authentication Helper
 * Helper functions to extract authenticated user from API routes
 */

import { NextRequest } from 'next/server';
import { getUserFromRequest, type AuthenticatedUser } from './middleware';

/**
 * Get authenticated user ID from request
 * Returns the user ID or throws an error if not authenticated
 */
export async function getAuthUserId(request: NextRequest): Promise<string> {
  const user = await getUserFromRequest(request);
  
  if (!user) {
    throw new Error('Unauthorized: Authentication required');
  }
  
  return user.id;
}

/**
 * Get authenticated user from request (optional)
 * Returns the user or null if not authenticated
 */
export async function getAuthUser(request: NextRequest): Promise<AuthenticatedUser | null> {
  return getUserFromRequest(request);
}

/**
 * Get authenticated user from request (required)
 * Returns the user or throws an error if not authenticated
 */
export async function requireAuthUser(request: NextRequest): Promise<AuthenticatedUser> {
  const user = await getUserFromRequest(request);
  
  if (!user) {
    throw new Error('Unauthorized: Authentication required');
  }
  
  return user;
}

/**
 * Check if user has admin role
 */
export async function isAdmin(request: NextRequest): Promise<boolean> {
  const user = await getUserFromRequest(request);
  return user?.role === 'admin';
}

/**
 * Require admin role
 * Throws error if user is not admin
 */
export async function requireAdmin(request: NextRequest): Promise<AuthenticatedUser> {
  const user = await requireAuthUser(request);
  
  if (user.role !== 'admin') {
    throw new Error('Forbidden: Admin access required');
  }
  
  return user;
}
