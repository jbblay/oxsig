import { NextRequest, NextResponse } from 'next/server';
import { generateTokenPair, TOKEN_EXPIRY, verifyJWT } from '@/lib/auth/jwt';
import { clearAuthCookies, setAuthCookies } from '@/lib/auth/cookies';
import { hasDemoSession, setDemoSessionCookie } from '@/lib/auth/demo';
import { fingerprintSessionToken } from '@/lib/auth/session-token';
import { getPool } from '@/lib/db/pool';
import { getClientIp, getUserAgent } from '@/lib/http/client-info';

function unauthorized(message: string): NextResponse {
  const response = NextResponse.json({ error: 'Invalid session', message }, { status: 401 });
  clearAuthCookies(response);
  return response;
}

export async function POST(request: NextRequest) {
  try {
    if (hasDemoSession(request)) {
      const response = NextResponse.json({
        success: true,
        expiresIn: TOKEN_EXPIRY.ACCESS,
        demo: true,
      });
      setDemoSessionCookie(response);
      return response;
    }

    const token = request.cookies.get('refreshToken')?.value;
    if (!token) return unauthorized('A refresh token is required');

    const payload = await verifyJWT(token);
    if (!payload || payload.type !== 'refresh') {
      return unauthorized('The refresh token is invalid or expired');
    }

    const currentFingerprint = fingerprintSessionToken(token);
    const pool = getPool();
    const sessionResult = await pool.query(
      `SELECT s.id AS session_id, u.id, u.email, COALESCE(u.role, 'user') AS role
       FROM sessions s
       JOIN users u ON u.id = s.user_id
       WHERE s.refresh_token = $1
         AND s.user_id = $2
         AND s.revoked_at IS NULL
         AND s.expires_at > NOW()
         AND u.is_active = true`,
      [currentFingerprint, payload.sub],
    );
    if (sessionResult.rows.length === 0) {
      return unauthorized('The session has expired or was revoked');
    }

    const session = sessionResult.rows[0];
    const tokens = await generateTokenPair(session.id, session.email, session.role);
    const updateResult = await pool.query(
      `UPDATE sessions
       SET refresh_token = $1,
           expires_at = NOW() + INTERVAL '7 days',
           device_info = $2,
           ip_address = $3
       WHERE id = $4 AND refresh_token = $5 AND revoked_at IS NULL
       RETURNING id`,
      [
        fingerprintSessionToken(tokens.refreshToken),
        getUserAgent(request),
        getClientIp(request),
        session.session_id,
        currentFingerprint,
      ],
    );
    if (updateResult.rows.length === 0) {
      return unauthorized('The session was refreshed by another request');
    }

    const response = NextResponse.json({
      success: true,
      expiresIn: TOKEN_EXPIRY.ACCESS,
    });
    setAuthCookies(response, tokens);
    return response;
  } catch (error) {
    console.error('Token refresh failed:', error);
    return NextResponse.json(
      { error: 'Refresh failed', message: 'Unable to refresh the session' },
      { status: 500 },
    );
  }
}
