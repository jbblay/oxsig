/**
 * Authentication API - POST /api/auth/logout
 * Revokes the current refresh session and clears auth cookies.
 */

import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { getPool } from '@/lib/db/pool';
import { hashRefreshToken } from '@/lib/auth/session';

export async function POST(_request: NextRequest) {
  const cookieStore = await cookies();
  const refreshToken = cookieStore.get('refreshToken')?.value;
  let revocationFailed = false;

  if (refreshToken) {
    try {
      const pool = getPool();
      await pool.query(
        `UPDATE sessions
         SET revoked_at = NOW()
         WHERE refresh_token = $1 OR refresh_token = $2`,
        [hashRefreshToken(refreshToken), refreshToken]
      );
    } catch (error) {
      revocationFailed = true;
      console.error('Logout session revocation failed:', error);
    }
  }

  const response = NextResponse.json(
    revocationFailed
      ? { message: 'Local logout completed; server session revocation could not be confirmed' }
      : { message: 'Logged out successfully' },
    { status: 200 }
  );

  response.cookies.set('accessToken', '', {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    maxAge: 0,
    path: '/',
  });

  response.cookies.set('refreshToken', '', {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    maxAge: 0,
    path: '/',
  });

  return response;
}
