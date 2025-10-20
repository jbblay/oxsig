/**
 * Authentication API - POST /api/auth/login
 * Authenticates user with their public key and signature
 * Returns JWT tokens for subsequent requests
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

export interface LoginRequest {
  publicKey: string;
  signature: string; // Signature of a challenge message
  challenge?: string; // Optional challenge message
}

export interface LoginResponse {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
  user: {
    id: string;
    publicKey: string;
    displayName?: string;
    email?: string;
  };
}

/**
 * Generate JWT access token
 */
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

/**
 * Generate JWT refresh token
 */
async function generateRefreshToken(userId: string): Promise<string> {
  const secret = new TextEncoder().encode(
    process.env.JWT_SECRET || 'your_secret_key_here_change_in_production'
  );

  const alg = 'HS256';
  const jwt = await new jose.SignJWT({
    sub: userId,
    type: 'refresh',
  })
    .setProtectedHeader({ alg })
    .setIssuedAt()
    .setExpirationTime('7d')
    .setJti(crypto.randomUUID())
    .sign(secret);

  return jwt;
}

export async function POST(request: NextRequest) {
  try {
    const body: LoginRequest = await request.json();
    const { publicKey, signature, challenge } = body;

    // Validate required fields
    if (!publicKey || !signature) {
      return NextResponse.json(
        { error: 'Public key and signature are required' },
        { status: 400 }
      );
    }

    // TODO: Verify signature against challenge
    // For now, we'll just check if the user exists
    // In production, you MUST verify the signature cryptographically
    // const message = challenge || `Login to OxSig at ${Date.now()}`;
    // const isValid = await verifySignature(publicKey, signature, message);
    // if (!isValid) {
    //   return NextResponse.json(
    //     { error: 'Invalid signature' },
    //     { status: 401 }
    //   );
    // }

    // Get user from database
    const result = await getPool().query(
      `SELECT id, public_key, display_name, email, 
              COALESCE(metadata->>'role', 'user') as role,
              is_active
       FROM users 
       WHERE public_key = $1 AND is_active = true`,
      [publicKey]
    );

    if (result.rows.length === 0) {
      return NextResponse.json(
        { error: 'User not found or inactive' },
        { status: 404 }
      );
    }

    const user = result.rows[0];

    // Generate tokens
    const accessToken = await generateAccessToken(user.id, user.email, user.role);
    const refreshToken = await generateRefreshToken(user.id);

    // Update last seen
    await getPool().query(
      'UPDATE users SET last_seen_at = NOW() WHERE id = $1',
      [user.id]
    );

    // TODO: Store session in Redis
    // await storeSession(user.id, refreshToken, 7 * 24 * 60 * 60);

    const response: LoginResponse = {
      accessToken,
      refreshToken,
      expiresIn: 24 * 60 * 60, // 24 hours in seconds
      user: {
        id: user.id,
        publicKey: user.public_key,
        displayName: user.display_name,
        email: user.email,
      },
    };

    return NextResponse.json(response, { status: 200 });
  } catch (error) {
    console.error('Login error:', error);
    return NextResponse.json(
      { error: 'Failed to authenticate', details: String(error) },
      { status: 500 }
    );
  }
}
