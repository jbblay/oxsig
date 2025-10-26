/**
 * DID Authentication API - POST /api/auth/did/login
 * Authenticates user with DID signature verification
 * Returns JWT tokens in httpOnly cookies
 */

import { NextRequest, NextResponse } from 'next/server';
import { generateTokenPair } from '@/lib/auth/jwt';
import { getPool } from '@/lib/db/pool';
import { checkRateLimit, RATE_LIMITS } from '@/lib/security/rate-limit';
import * as ed25519 from '@noble/ed25519';
import { sha256 } from '@noble/hashes/sha256';
import { hexToBytes, bytesToHex } from '@noble/hashes/utils';

export async function POST(request: NextRequest) {
  // Rate limit: 5 requests per minute to prevent brute force
  const rateLimitResponse = await checkRateLimit(request, RATE_LIMITS.AUTH_LOGIN);
  if (rateLimitResponse) {
    return rateLimitResponse;
  }

  try {
    const body = await request.json();
    const { publicKey, signature, challenge, did } = body;
    
    // Validate input
    if (!publicKey || !signature || !challenge) {
      return NextResponse.json(
        { error: 'Missing credentials', message: 'Public key, signature, and challenge are required' },
        { status: 400 }
      );
    }

    // Verify signature
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
    
    // Query or create user from database
    const pool = getPool();
    let result = await pool.query(
      `SELECT id, public_key, display_name, email, is_active 
       FROM users 
       WHERE public_key = $1`,
      [publicKey]
    );
    
    let user;
    if (result.rows.length === 0) {
      // Create new user with DID
      const insertResult = await pool.query(
        `INSERT INTO users (public_key, display_name, is_active) 
         VALUES ($1, $2, true) 
         RETURNING id, public_key, display_name, email, is_active`,
        [publicKey, did || `user-${publicKey.substring(0, 8)}`]
      );
      user = insertResult.rows[0];
    } else {
      user = result.rows[0];
      
      // Check if user is active
      if (!user.is_active) {
        return NextResponse.json(
          { error: 'Account disabled', message: 'Your account has been disabled' },
          { status: 403 }
        );
      }
    }
    
    // Update last login
    await pool.query(
      `UPDATE users SET last_login_at = NOW() WHERE id = $1`,
      [user.id]
    );
    
    // Generate JWT tokens
    const { accessToken, refreshToken } = await generateTokenPair(
      user.id,
      user.email
    );
    
    // Create response with httpOnly cookies
    const response = NextResponse.json({
      success: true,
      user: {
        id: user.id,
        publicKey: user.public_key,
        displayName: user.display_name,
        email: user.email,
        authMethod: 'did'
      }
    }, { status: 200 });
    
    // Set httpOnly cookies
    response.cookies.set('accessToken', accessToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 15 * 60, // 15 minutes
      path: '/'
    });
    
    response.cookies.set('refreshToken', refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 7 * 24 * 60 * 60, // 7 days
      path: '/'
    });
    
    return response;
    
  } catch (error) {
    console.error('DID login error:', error);
    return NextResponse.json(
      { error: 'Login failed', message: 'An error occurred during authentication' },
      { status: 500 }
    );
  }
}