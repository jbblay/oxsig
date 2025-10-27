/**
 * WebAuthn Authentication - Generate Options
 * POST /api/webauthn/authenticate/options
 * 
 * Generates challenge and options for authentication with FIDO2 credential
 */

import { NextRequest, NextResponse } from 'next/server';
import { getPool } from '@/lib/db/postgres';
import { randomBytes } from 'crypto';
import { z } from 'zod';

const authOptionsSchema = z.object({
  email: z.string().email().optional(),
  did: z.string().optional(),
});

/**
 * POST /api/webauthn/authenticate/options
 * Generate authentication options
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const validation = authOptionsSchema.safeParse(body);

    if (!validation.success) {
      return NextResponse.json(
        { error: 'Validation failed', errors: validation.error.errors },
        { status: 400 }
      );
    }

    const { email, did } = validation.data;
    const pool = getPool();

    // Find user
    let userQuery;
    let userParams;
    
    if (email) {
      userQuery = 'SELECT id, email, did FROM users WHERE email = $1';
      userParams = [email];
    } else if (did) {
      userQuery = 'SELECT id, email, did FROM users WHERE did = $1';
      userParams = [did];
    } else {
      return NextResponse.json(
        { error: 'Email or DID required' },
        { status: 400 }
      );
    }

    const userResult = await pool.query(userQuery, userParams);

    if (userResult.rows.length === 0) {
      // Don't reveal if user exists - return generic error after delay
      await new Promise(resolve => setTimeout(resolve, 1000));
      return NextResponse.json(
        { error: 'Authentication failed' },
        { status: 401 }
      );
    }

    const user = userResult.rows[0];

    // Get user's credentials
    const credsResult = await pool.query(
      `SELECT id, transports FROM webauthn_credentials 
       WHERE user_id = $1 
       ORDER BY last_used_at DESC NULLS LAST`,
      [user.id]
    );

    if (credsResult.rows.length === 0) {
      return NextResponse.json(
        { error: 'No credentials registered' },
        { status: 404 }
      );
    }

    // Generate challenge
    const challenge = randomBytes(32);
    const challengeB64 = challenge.toString('base64url');

    // Store challenge
    await pool.query(
      `INSERT INTO webauthn_challenges 
       (id, user_id, email, challenge_type, expires_at, ip_address, user_agent)
       VALUES ($1, $2, $3, 'authentication', NOW() + INTERVAL '5 minutes', $4, $5)`,
      [
        challengeB64,
        user.id,
        user.email,
        request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip'),
        request.headers.get('user-agent'),
      ]
    );

    // Build allowed credentials list
    const allowCredentials = credsResult.rows.map((row) => ({
      id: row.id,
      type: 'public-key' as const,
      transports: (JSON.parse(row.transports) as AuthenticatorTransport[]) || ['usb', 'nfc', 'ble', 'internal'],
    }));

    // Return WebAuthn authentication options
    const options: PublicKeyCredentialRequestOptions = {
      challenge: challenge,
      timeout: 60000,
      rpId: process.env.NEXT_PUBLIC_RP_ID || 'localhost',
      allowCredentials,
      userVerification: 'preferred',
    };

    return NextResponse.json({
      options: {
        ...options,
        challenge: challengeB64,
      },
      challengeId: challengeB64,
      userId: user.id,
    });
  } catch (error) {
    console.error('Failed to generate authentication options:', error);
    return NextResponse.json(
      { error: 'Failed to generate authentication options' },
      { status: 500 }
    );
  }
}
