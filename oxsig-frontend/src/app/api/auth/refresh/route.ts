/**
 * Authentication API - POST /api/auth/refresh
 * Refreshes an expired access token using a valid refresh token
 */

import { NextRequest, NextResponse } from 'next/server';
import { Pool } from 'pg';
import * as jose from 'jose';

let pool: Pool | null = null;

function getPool() {
  if (!pool) {
    pool = new Pool({
      host: process.env.POSTGRES_HOST || 'localhost',
      port: parseInt(process.env.POSTGRES_PORT || '5432'),
      database: process.env.POSTGRES_DB || 'oxsig',
      user: process.env.POSTGRES_USER || 'oxsig',
      password: process.env.POSTGRES_PASSWORD || 'changeme',
      max: 20,
    });
  }
  return pool;
}

export interface RefreshRequest {
  refreshToken: string;
}

export interface RefreshResponse {
  accessToken: string;
  expiresIn: number;
}

async function verifyRefreshToken(token: string): Promise<jose.JWTPayload> {
  const secret = new TextEncoder().encode(
    process.env.JWT_SECRET || 'your_secret_key_here_change_in_production'
  );

  const { payload } = await jose.jwtVerify(token, secret);
  return payload;
}

async function generateAccessToken(userId: string, email: string | null, role: string): Promise<string> {
  const secret = new TextEncoder().encode(
    process.env.JWT_SECRET || 'your_secret_key_here_change_in_production'
  );

  const alg = 'HS256';
  const jwt = await new jose.SignJWT({
    sub: userId,
    email: email || '',
    role: role || 'user',
  })
    .setProtectedHeader({ alg })
    .setIssuedAt()
    .setExpirationTime('24h')
    .setJti(crypto.randomUUID())
    .sign(secret);

  return jwt;
}

export async function POST(request: NextRequest) {
  try {
    const body: RefreshRequest = await request.json();
    const { refreshToken } = body;

    if (!refreshToken) {
      return NextResponse.json(
        { error: 'Refresh token is required' },
        { status: 400 }
      );
    }

    // Verify refresh token
    let payload: jose.JWTPayload;
    try {
      payload = await verifyRefreshToken(refreshToken);
    } catch (error) {
      return NextResponse.json(
        { error: 'Invalid or expired refresh token' },
        { status: 401 }
      );
    }

    // Check if it's a refresh token
    if (payload.type !== 'refresh') {
      return NextResponse.json(
        { error: 'Not a refresh token' },
        { status: 401 }
      );
    }

    const userId = payload.sub as string;

    // TODO: Validate session in Redis
    // const isValidSession = await validateSession(userId, payload.jti);
    // if (!isValidSession) {
    //   return NextResponse.json(
    //     { error: 'Session invalidated' },
    //     { status: 401 }
    //   );
    // }

    // Get user data
    const result = await getPool().query(
      `SELECT id, email, COALESCE(metadata->>'role', 'user') as role, is_active
       FROM users 
       WHERE id = $1 AND is_active = true`,
      [userId]
    );

    if (result.rows.length === 0) {
      return NextResponse.json(
        { error: 'User not found or inactive' },
        { status: 404 }
      );
    }

    const user = result.rows[0];

    // Generate new access token
    const accessToken = await generateAccessToken(user.id, user.email, user.role);

    const response: RefreshResponse = {
      accessToken,
      expiresIn: 24 * 60 * 60, // 24 hours in seconds
    };

    return NextResponse.json(response, { status: 200 });
  } catch (error) {
    console.error('Token refresh error:', error);
    return NextResponse.json(
      { error: 'Failed to refresh token', details: String(error) },
      { status: 500 }
    );
  }
}
