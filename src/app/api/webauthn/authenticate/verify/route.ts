/**
 * WebAuthn Authentication - Verify
 * POST /api/webauthn/authenticate/verify
 * 
 * Verifies authentication assertion and issues JWT tokens
 */

import { NextRequest, NextResponse } from 'next/server';
import { getPool } from '@/lib/db/postgres';
import { z } from 'zod';
import { verifyAuthenticationResponse } from '@/lib/crypto/webauthn';
import { generateTokenPair } from '@/lib/auth/jwt';
import { cookies } from 'next/headers';

const verifyAuthSchema = z.object({
  challengeId: z.string(),
  credential: z.object({
    id: z.string(),
    rawId: z.string(),
    type: z.literal('public-key'),
    response: z.object({
      clientDataJSON: z.string(),
      authenticatorData: z.string(),
      signature: z.string(),
      userHandle: z.string().optional(),
    }),
  }),
});

/**
 * POST /api/webauthn/authenticate/verify
 * Verify authentication and issue tokens
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const validation = verifyAuthSchema.safeParse(body);

    if (!validation.success) {
      return NextResponse.json(
        { error: 'Validation failed', errors: validation.error.errors },
        { status: 400 }
      );
    }

    const { challengeId, credential } = validation.data;
    const pool = getPool();

    // Verify challenge exists and hasn't been used
    const challengeResult = await pool.query(
      `SELECT * FROM webauthn_challenges 
       WHERE id = $1 AND challenge_type = 'authentication' 
       AND used_at IS NULL AND expires_at > NOW()`,
      [challengeId]
    );

    if (challengeResult.rows.length === 0) {
      return NextResponse.json(
        { error: 'Invalid or expired challenge' },
        { status: 400 }
      );
    }

    const challenge = challengeResult.rows[0];

    // Get credential from database
    const credResult = await pool.query(
      `SELECT c.*, u.id as user_id, u.email, u.did, u.role 
       FROM webauthn_credentials c
       JOIN users u ON c.user_id = u.id
       WHERE c.id = $1`,
      [credential.id]
    );

    if (credResult.rows.length === 0) {
      return NextResponse.json(
        { error: 'Credential not found' },
        { status: 404 }
      );
    }

    const storedCred = credResult.rows[0];

    // Verify the credential belongs to the challenge's user
    if (storedCred.user_id !== challenge.user_id) {
      return NextResponse.json(
        { error: 'Credential mismatch' },
        { status: 403 }
      );
    }

    // Verify the assertion
    const verified = await verifyAuthenticationResponse({
      credential,
      expectedChallenge: Buffer.from(challengeId, 'base64url'),
      expectedOrigin: process.env.NEXT_PUBLIC_ORIGIN || 'http://localhost:3000',
      expectedRPID: process.env.NEXT_PUBLIC_RP_ID || 'localhost',
      storedPublicKey: storedCred.public_key,
      storedCounter: storedCred.counter,
    });

    if (!verified.success) {
      return NextResponse.json(
        { error: 'Authentication verification failed', details: verified.error },
        { status: 401 }
      );
    }

    // Mark challenge as used
    await pool.query(
      `UPDATE webauthn_challenges SET used_at = NOW() WHERE id = $1`,
      [challengeId]
    );

    // Update credential counter and last used
    await pool.query(
      `UPDATE webauthn_credentials 
       SET counter = $1, last_used_at = NOW(), updated_at = NOW()
       WHERE id = $2`,
      [verified.counter, credential.id]
    );

    // Update user's last login
    await pool.query(
      `UPDATE users SET last_login_at = NOW(), last_seen_at = NOW() WHERE id = $1`,
      [storedCred.user_id]
    );

    // Generate JWT tokens
    const { accessToken, refreshToken } = await generateTokenPair(
      storedCred.user_id,
      storedCred.email,
      storedCred.role
    );

    // Set httpOnly cookies
    const cookieStore = await cookies();
    cookieStore.set('accessToken', accessToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 15 * 60, // 15 minutes
      path: '/',
    });
    
    cookieStore.set('refreshToken', refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 7 * 24 * 60 * 60, // 7 days
      path: '/',
    });

    // Log activity
    await pool.query(
      `INSERT INTO activity_log (user_id, action, entity_type, entity_id, metadata)
       VALUES ($1, 'WEBAUTHN_LOGIN', 'credential', $2, $3)`,
      [
        storedCred.user_id,
        credential.id,
        JSON.stringify({
          deviceName: storedCred.device_name,
          userVerified: verified.userVerified,
        }),
      ]
    );

    return NextResponse.json({
      success: true,
      user: {
        id: storedCred.user_id,
        email: storedCred.email,
        did: storedCred.did,
        role: storedCred.role,
      },
      accessToken,
      refreshToken,
    });
  } catch (error) {
    console.error('Failed to verify authentication:', error);
    return NextResponse.json(
      { error: 'Authentication failed' },
      { status: 500 }
    );
  }
}
