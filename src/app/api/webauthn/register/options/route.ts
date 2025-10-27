/**
 * WebAuthn Registration - Generate Options
 * POST /api/webauthn/register/options
 * 
 * Generates challenge and options for registering a new FIDO2 credential
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth/middleware';
import { getPool } from '@/lib/db/postgres';
import { randomBytes } from 'crypto';

/**
 * POST /api/webauthn/register/options
 * Generate registration options for adding a new security key
 */
export async function POST(request: NextRequest) {
  return requireAuth(request, async (req, user) => {
    try {
      const pool = getPool();

      // Generate random challenge (32 bytes)
      const challenge = randomBytes(32);
      const challengeB64 = challenge.toString('base64url');

      // Store challenge in database
      await pool.query(
        `INSERT INTO webauthn_challenges 
         (id, user_id, challenge_type, expires_at, ip_address, user_agent)
         VALUES ($1, $2, 'registration', NOW() + INTERVAL '5 minutes', $3, $4)`,
        [
          challengeB64,
          user.id,
          req.headers.get('x-forwarded-for') || req.headers.get('x-real-ip'),
          req.headers.get('user-agent'),
        ]
      );

      // Get existing credentials to exclude
      const existingCreds = await pool.query(
        `SELECT id FROM webauthn_credentials WHERE user_id = $1`,
        [user.id]
      );

      const excludeCredentials = existingCreds.rows.map((row) => ({
        id: row.id,
        type: 'public-key' as const,
        transports: ['usb', 'nfc', 'ble', 'internal'] as AuthenticatorTransport[],
      }));

      // Return WebAuthn registration options
      const options: PublicKeyCredentialCreationOptions = {
        challenge: challenge,
        rp: {
          name: 'OxSig',
          id: process.env.NEXT_PUBLIC_RP_ID || 'localhost',
        },
        user: {
          id: Buffer.from(user.id),
          name: user.email || user.did || `user-${user.id}`,
          displayName: user.name || user.email || 'OxSig User',
        },
        pubKeyCredParams: [
          { alg: -7, type: 'public-key' }, // ES256
          { alg: -257, type: 'public-key' }, // RS256
          { alg: -8, type: 'public-key' }, // EdDSA
        ],
        authenticatorSelection: {
          authenticatorAttachment: 'cross-platform', // External security keys
          requireResidentKey: false,
          residentKey: 'preferred',
          userVerification: 'preferred', // Prefer PIN/biometric
        },
        timeout: 60000, // 60 seconds
        attestation: 'direct', // Request attestation for device verification
        excludeCredentials,
      };

      return NextResponse.json({
        options: {
          ...options,
          challenge: challengeB64, // Send as base64url string
          user: {
            ...options.user,
            id: Buffer.from(options.user.id as ArrayBuffer).toString('base64url'),
          },
        },
        challengeId: challengeB64,
      });
    } catch (error) {
      console.error('Failed to generate registration options:', error);
      return NextResponse.json(
        { error: 'Failed to generate registration options' },
        { status: 500 }
      );
    }
  });
}
