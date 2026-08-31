import { NextRequest, NextResponse } from 'next/server';
import { clearAuthCookies } from '@/lib/auth/cookies';
import { clearDemoSessionCookie, hasDemoSession } from '@/lib/auth/demo';
import { fingerprintSessionToken } from '@/lib/auth/session-token';
import { getPool } from '@/lib/db/pool';

export async function POST(request: NextRequest) {
  try {
    const demoSession = hasDemoSession(request);
    const token = request.cookies.get('refreshToken')?.value;

    if (token && !demoSession) {
      await getPool().query(
        'UPDATE sessions SET revoked_at = NOW() WHERE refresh_token = $1 AND revoked_at IS NULL',
        [fingerprintSessionToken(token)],
      );
    }

    const response = NextResponse.json({ success: true });
    clearAuthCookies(response);
    clearDemoSessionCookie(response);
    return response;
  } catch (error) {
    console.error('Logout failed:', error);
    const response = NextResponse.json(
      { error: 'Logout failed', message: 'The local session was cleared' },
      { status: 500 },
    );
    clearAuthCookies(response);
    clearDemoSessionCookie(response);
    return response;
  }
}
