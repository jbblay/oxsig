/**
 * DID Authentication API - POST /api/auth/did/register
 * Registers new user with DID and public key verification
 * Returns JWT tokens in httpOnly cookies
 */

import { NextRequest, NextResponse } from 'next/server';
import { generateTokenPair } from '@/lib/auth/jwt';
import { getPool } from '@/lib/db/pool';
import { checkRateLimit, RATE_LIMITS } from '@/lib/security/rate-limit';
import * as ed25519 from '@noble/ed25519';
import { hexToBytes } from '@noble/hashes/utils';
import { hashRefreshToken } from '@/lib/auth/session';

export async function POST(request: NextRequest) {
  // Rate limit: 3 requests per minute for registration
  const rateLimitResponse = await checkRateLimit(request, RATE_LIMITS.AUTH_REGISTER);
  if (rateLimitResponse) {
    return rateLimitResponse;
  }

  try {
    const body = await request.json();
    const { publicKey, signature, challenge, did, displayName, email } = body;
    
    // Validate required fields
    if (!publicKey || !signature || !challenge) {
      return NextResponse.json(
        { error: 'Missing credentials', message: 'Public key, signature, and challenge are required' },
        { status: 400 }
      );
    }

    // Validate display name
    if (displayName && (displayName.length < 2 || displayName.length > 100)) {
      return NextResponse.json(
        { error: 'Invalid display name', message: 'Display name must be between 2 and 100 characters' },
        { status: 400 }
      );
    }

    // Validate email format if provided
    if (email) {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(email)) {
        return NextResponse.json(
          { error: 'Invalid email', message: 'Please provide a valid email address' },
          { status: 400 }
        );
      }
    }

    // Verify signature to prove ownership of private key
    try {
      const publicKeyBytes = hexToBytes(publicKey);
      const signatureBytes = hexToBytes(signature);
      const challengeBytes = new TextEncoder().encode(challenge);
      
      const isValid = await ed25519.verify(signatureBytes, challengeBytes, publicKeyBytes);
      
      if (!isValid) {
        return NextResponse.json(
          { error: 'Invalid signature', message: 'Signature verification failed' },
          { status: 401 }
        );
      }
    } catch (error) {
      return NextResponse.json(
        { error: 'Invalid signature format', message: 'Failed to verify signature' },
        { status: 400 }
      );
    }
    
    // Check if user already exists
    const pool = getPool();
    const existingUser = await pool.query(
      `SELECT id FROM users WHERE public_key = $1 OR ($2::text IS NOT NULL AND email = $2)`,
      [publicKey, email || null]
    );
    
    if (existingUser.rows.length > 0) {
      return NextResponse.json(
        { error: 'User exists', message: 'User with this public key or email already exists' },
        { status: 409 }
      );
    }
    
    // Create new user
    const result = await pool.query(
      `INSERT INTO users (public_key, display_name, email, is_active, created_at) 
       VALUES ($1, $2, $3, true, NOW()) 
       RETURNING id, public_key, display_name, email, created_at`,
      [
        publicKey,
        displayName || did || `user-${publicKey.substring(0, 8)}`,
        email || null
      ]
    );
    
    const user = result.rows[0];
    
    // Generate JWT tokens
    const { accessToken, refreshToken } = await generateTokenPair(
      user.id,
      user.email
    );

    await pool.query(
      `INSERT INTO sessions (user_id, refresh_token, device_info, ip_address, expires_at)
       VALUES ($1, $2, $3, $4, NOW() + INTERVAL '7 days')`,
      [
        user.id,
        hashRefreshToken(refreshToken),
        request.headers.get('user-agent') || 'unknown',
        request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || null,
      ]
    );
    
    // Create response
    const response = NextResponse.json({
      success: true,
      user: {
        id: user.id,
        publicKey: user.public_key,
        displayName: user.display_name,
        email: user.email,
        createdAt: user.created_at,
        authMethod: 'did'
      },
      message: 'User registered successfully'
    }, { status: 201 });
    
    // Set httpOnly cookies
    response.cookies.set('accessToken', accessToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 15 * 60, // 15 minutes
      path: '/'
    });
    
    response.cookies.set('refreshToken', refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 7 * 24 * 60 * 60, // 7 days
      path: '/'
    });
    
    return response;
    
  } catch (error) {
    console.error('DID registration error:', error);
    
    // Handle database constraint violations
    if (error instanceof Error && error.message.includes('duplicate key')) {
      return NextResponse.json(
        { error: 'User exists', message: 'User with this public key already exists' },
        { status: 409 }
      );
    }
    
    return NextResponse.json(
      { error: 'Registration failed', message: 'An error occurred during registration' },
      { status: 500 }
    );
  }
}
