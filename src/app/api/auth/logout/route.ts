import { NextRequest, NextResponse } from 'next/server';
import { clearAuthCookies } from '@/lib/auth/cookies';
import { fingerprintSessionToken } from '@/lib/auth/session-token';
import { getPool } from '@/lib/db/pool';

export async function POST(request: NextRequest) {
  try {
    const token = request.cookies.get('refreshToken')?.value;

    if (token) {
      await getPool().query(
        'UPDATE sessions SET revoked_at = NOW() WHERE refresh_token = $1 AND revoked_at IS NULL',
        [fingerprintSessionToken(token)],
      );
    }

    const response = NextResponse.json({ success: true });
    clearAuthCookies(response);
    return response;
  } catch (error) {
    console.error('Logout failed:', error);
    const response = NextResponse.json(
      { error: 'Logout failed', message: 'The local session was cleared' },
      { status: 500 },
    );
    clearAuthCookies(response);
    return response;
  }
}
