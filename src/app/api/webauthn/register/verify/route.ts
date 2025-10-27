/**
 * WebAuthn Registration - Verify Credential
 * POST /api/webauthn/register/verify
 * 
 * Verifies and stores a newly registered FIDO2 credential
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth/middleware';
import { getPool } from '@/lib/db/postgres';
import { z } from 'zod';
import { verifyRegistrationResponse } from '@/lib/crypto/webauthn';

const verifyRegistrationSchema = z.object({
  challengeId: z.string(),
  credential: z.object({
    id: z.string(),
    rawId: z.string(),
    type: z.literal('public-key'),
    response: z.object({
      clientDataJSON: z.string(),
      attestationObject: z.string(),
      transports: z.array(z.string()).optional(),
    }),
  }),
  deviceName: z.string().optional(),
});

/**
 * POST /api/webauthn/register/verify
 * Verify and store new credential
 */
export async function POST(request: NextRequest) {
  return requireAuth(request, async (req, user) => {
    try {
      const body = await req.json();
      const validation = verifyRegistrationSchema.safeParse(body);

      if (!validation.success) {
        return NextResponse.json(
          { error: 'Validation failed', errors: validation.error.errors },
          { status: 400 }
        );
      }

      const { challengeId, credential, deviceName } = validation.data;
      const pool = getPool();

      // Verify challenge exists and hasn't been used
      const challengeResult = await pool.query(
        `SELECT * FROM webauthn_challenges 
         WHERE id = $1 AND user_id = $2 AND challenge_type = 'registration' 
         AND used_at IS NULL AND expires_at > NOW()`,
        [challengeId, user.id]
      );

      if (challengeResult.rows.length === 0) {
        return NextResponse.json(
          { error: 'Invalid or expired challenge' },
          { status: 400 }
        );
      }

      const challenge = challengeResult.rows[0];

      // Verify the credential
      const verified = await verifyRegistrationResponse({
        credential,
        expectedChallenge: Buffer.from(challengeId, 'base64url'),
        expectedOrigin: process.env.NEXT_PUBLIC_ORIGIN || 'http://localhost:3000',
        expectedRPID: process.env.NEXT_PUBLIC_RP_ID || 'localhost',
      });

      if (!verified.success) {
        return NextResponse.json(
          { error: 'Credential verification failed', details: verified.error },
          { status: 400 }
        );
      }

      // Mark challenge as used
      await pool.query(
        `UPDATE webauthn_challenges SET used_at = NOW() WHERE id = $1`,
        [challengeId]
      );

      // Store credential
      await pool.query(
        `INSERT INTO webauthn_credentials 
         (id, user_id, public_key, counter, aaguid, transports, 
          attestation_format, attestation_object, user_verified, 
          backup_eligible, backup_state, device_name)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
        [
          credential.id,
          user.id,
          verified.publicKey,
          verified.counter,
          verified.aaguid,
          JSON.stringify(credential.response.transports || []),
          verified.attestationFormat,
          credential.response.attestationObject,
          verified.userVerified,
          verified.backupEligible,
          verified.backupState,
          deviceName || 'Security Key',
        ]
      );

      // Log activity
      await pool.query(
        `INSERT INTO activity_log (user_id, action, entity_type, entity_id, metadata)
         VALUES ($1, 'REGISTER_WEBAUTHN', 'credential', $2, $3)`,
        [
          user.id,
          credential.id,
          JSON.stringify({
            deviceName: deviceName || 'Security Key',
            attestationFormat: verified.attestationFormat,
            aaguid: verified.aaguid,
          }),
        ]
      );

      return NextResponse.json({
        success: true,
        credentialId: credential.id,
        deviceName: deviceName || 'Security Key',
      });
    } catch (error) {
      console.error('Failed to verify registration:', error);
      return NextResponse.json(
        { error: 'Failed to verify registration' },
        { status: 500 }
      );
    }
  });
}
