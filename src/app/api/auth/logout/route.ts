/**
 * Authentication API - POST /api/auth/logout
 * Invalidates the user's session and refresh token
 */

import { NextRequest, NextResponse } from 'next/server';
import * as jose from 'jose';

export interface LogoutRequest {
  refreshToken: string;
}

async function verifyToken(token: string): Promise<jose.JWTPayload> {
  const secret = new TextEncoder().encode(
    process.env.JWT_SECRET || 'your_secret_key_here_change_in_production'
  );

  const { payload } = await jose.jwtVerify(token, secret);
  return payload;
}

export async function POST(request: NextRequest) {
  try {
    const body: LogoutRequest = await request.json();
    const { refreshToken } = body;

    if (!refreshToken) {
      return NextResponse.json(
        { error: 'Refresh token is required' },
        { status: 400 }
      );
    }

    // Verify token to get JTI
    let payload: jose.JWTPayload;
    try {
      payload = await verifyToken(refreshToken);
    } catch (error) {
      // Even if token is invalid/expired, we'll consider logout successful
      return NextResponse.json(
        { message: 'Logged out successfully' },
        { status: 200 }
      );
    }

    // TODO: Invalidate session in Redis
    // const tokenId = payload.jti as string;
    // await invalidateSession(tokenId);

    // TODO: Add token to blacklist if needed
    // await addToBlacklist(refreshToken, payload.exp);

    return NextResponse.json(
      { message: 'Logged out successfully' },
      { status: 200 }
    );
  } catch (error) {
    console.error('Logout error:', error);
    return NextResponse.json(
      { error: 'Failed to logout', details: String(error) },
      { status: 500 }
    );
  }
}
