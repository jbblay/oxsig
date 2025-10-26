/**
 * Authentication API - POST /api/auth/logout
 * Invalidates the user's session and refresh token
 */

import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { getPool } from '@/lib/db/pool';
import { getUserFromRequest } from '@/lib/auth/middleware';

export async function POST(request: NextRequest) {
  try {
    const cookieStore = await cookies();
    const refreshToken = cookieStore.get('refreshToken')?.value;

    if (refreshToken) {
      // Revoke session in database
      const pool = getPool();
      await pool.query(
        'UPDATE sessions SET revoked_at = NOW() WHERE refresh_token = $1',
        [refreshToken]
      );
    }

    // Clear cookies
    const response = NextResponse.json({
      message: 'Logged out successfully'
    });

    response.cookies.delete('accessToken');
    response.cookies.delete('refreshToken');

    return response;
  } catch (error) {
    console.error('Logout error:', error);
    return NextResponse.json(
      { error: 'Failed to logout', details: String(error) },
      { status: 500 }
    );
  }
}
