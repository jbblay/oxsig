/**
 * Authentication API - POST /api/auth/refresh
 * Rotates a valid email-auth refresh session and renews httpOnly cookies.
 */

import { NextRequest, NextResponse } from 'next/server';
import { generateTokenPair, TOKEN_EXPIRY, verifyJWT } from '@/lib/auth/jwt';
import { hashRefreshToken } from '@/lib/auth/session';
import { getPool } from '@/lib/db/pool';

async function getRefreshToken(request: NextRequest): Promise<string | null> {
  const cookieToken = request.cookies.get('refreshToken')?.value;
  if (cookieToken) return cookieToken;

  // Optional body fallback for non-browser API clients. Browser email auth uses
  // the httpOnly cookie and never needs JavaScript access to the refresh token.
  try {
    const body = await request.json();
    return typeof body?.refreshToken === 'string' ? body.refreshToken : null;
  } catch {
    return null;
  }
}

export async function POST(request: NextRequest) {
  try {
    const refreshToken = await getRefreshToken(request);

    if (!refreshToken) {
      return NextResponse.json(
        { error: 'Refresh token is required' },
        { status: 401 }
      );
    }

    const payload = await verifyJWT(refreshToken);
    if (!payload || payload.type !== 'refresh') {
      return NextResponse.json(
        { error: 'Invalid or expired refresh token' },
        { status: 401 }
      );
    }

    const refreshTokenHash = hashRefreshToken(refreshToken);
    const pool = getPool();
    const client = await pool.connect();

    try {
      await client.query('BEGIN');

      const sessionResult = await client.query(
        `SELECT
           s.id AS session_id,
           s.refresh_token,
           u.id,
           u.email,
           u.display_name,
           u.public_key,
           u.role,
           u.is_active
         FROM sessions s
         JOIN users u ON u.id = s.user_id
         WHERE s.user_id = $1
           AND (s.refresh_token = $2 OR s.refresh_token = $3)
           AND s.revoked_at IS NULL
           AND s.expires_at > NOW()
         ORDER BY s.created_at DESC
         LIMIT 1
         FOR UPDATE`,
        [payload.sub, refreshTokenHash, refreshToken]
      );

      if (sessionResult.rows.length === 0) {
        await client.query('ROLLBACK');
        return NextResponse.json(
          { error: 'Session is invalid or has been revoked' },
          { status: 401 }
        );
      }

      const user = sessionResult.rows[0];
      if (!user.is_active) {
        await client.query('ROLLBACK');
        return NextResponse.json(
          { error: 'Account disabled' },
          { status: 403 }
        );
      }

      const { accessToken, refreshToken: nextRefreshToken } = await generateTokenPair(
        user.id,
        user.email,
        user.role || 'user'
      );

      await client.query(
        `UPDATE sessions
         SET refresh_token = $1,
             expires_at = NOW() + INTERVAL '7 days'
         WHERE id = $2`,
        [hashRefreshToken(nextRefreshToken), user.session_id]
      );

      await client.query('COMMIT');

      const response = NextResponse.json({
        success: true,
        expiresIn: TOKEN_EXPIRY.ACCESS,
        user: {
          id: user.id,
          publicKey: user.public_key || '',
          displayName: user.display_name || user.email,
          email: user.email,
          role: user.role || 'user',
        },
      });

      response.cookies.set('accessToken', accessToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'strict',
        maxAge: TOKEN_EXPIRY.ACCESS,
        path: '/',
      });

      response.cookies.set('refreshToken', nextRefreshToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'strict',
        maxAge: TOKEN_EXPIRY.REFRESH,
        path: '/',
      });

      return response;
    } catch (error) {
      await client.query('ROLLBACK').catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  } catch (error) {
    console.error('Token refresh error:', error);
    return NextResponse.json(
      { error: 'Failed to refresh session' },
      { status: 500 }
    );
  }
}
