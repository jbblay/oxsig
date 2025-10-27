/**
 * Complete Recovery API
 * POST /api/recovery/complete - Reconstruct master key and complete recovery
 */

import { NextRequest, NextResponse } from 'next/server';
import { getPool } from '@/lib/db/postgres';
import { z } from 'zod';
import { completeRecovery, type ShamirShare } from '@/lib/crypto/social-recovery';
import { ed25519 } from '@noble/curves/ed25519';

const completeRecoverySchema = z.object({
  sessionId: z.string(),
  // New password hash (if using password auth)
  newPasswordHash: z.string().optional(),
});

/**
 * POST /api/recovery/complete
 * Complete recovery and get new credentials
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const validation = completeRecoverySchema.safeParse(body);

    if (!validation.success) {
      return NextResponse.json(
        { error: 'Validation failed', errors: validation.error.errors },
        { status: 400 }
      );
    }

    const { sessionId, newPasswordHash } = validation.data;
    const pool = getPool();

    // Get recovery session with shares
    const sessionResult = await pool.query(
      `SELECT 
         rs.*,
         u.id as user_id, u.did,
         rss.shares
       FROM recovery_sessions rs
       JOIN users u ON rs.user_id = u.id
       LEFT JOIN recovery_session_shares rss ON rs.id = rss.session_id
       WHERE rs.id = $1`,
      [sessionId]
    );

    if (sessionResult.rows.length === 0) {
      return NextResponse.json(
        { error: 'Recovery session not found' },
        { status: 404 }
      );
    }

    const sessionData = sessionResult.rows[0];
    const shares: ShamirShare[] = sessionData.shares || [];

    // Create session object
    const session = {
      id: sessionData.id,
      userDid: sessionData.did,
      initiatedAt: new Date(sessionData.initiated_at).getTime(),
      canCompleteAt: new Date(sessionData.can_complete_at).getTime(),
      collectedShares: shares,
      respondedGuardians: sessionData.responded_guardians || [],
      threshold: sessionData.threshold,
      expiresAt: new Date(sessionData.expires_at).getTime(),
      status: sessionData.status,
    };

    // Complete recovery and get master key
    let masterKey: Buffer;
    try {
      masterKey = completeRecovery(session);
    } catch (error: any) {
      return NextResponse.json(
        { error: error.message || 'Failed to complete recovery' },
        { status: 400 }
      );
    }

    // Generate new keypair from master key (or use master key as private key)
    const privateKey = masterKey;
    const publicKey = ed25519.getPublicKey(privateKey);

    // Update user's credentials
    const updateQuery = newPasswordHash
      ? `UPDATE users
         SET password_hash = $1,
             public_key = $2,
             updated_at = NOW()
         WHERE id = $3`
      : `UPDATE users
         SET public_key = $1,
             updated_at = NOW()
         WHERE id = $2`;

    const updateParams = newPasswordHash
      ? [newPasswordHash, Buffer.from(publicKey).toString('hex'), sessionData.user_id]
      : [Buffer.from(publicKey).toString('hex'), sessionData.user_id];

    await pool.query(updateQuery, updateParams);

    // Mark session as completed
    await pool.query(
      `UPDATE recovery_sessions
       SET status = 'completed', updated_at = NOW()
       WHERE id = $1`,
      [sessionId]
    );

    // Log activity
    await pool.query(
      `INSERT INTO activity_log (user_id, action, entity_type, entity_id, metadata)
       VALUES ($1, 'COMPLETE_RECOVERY', 'recovery', $2, $3)`,
      [
        sessionData.user_id,
        sessionId,
        JSON.stringify({
          sharesUsed: shares.length,
          threshold: session.threshold,
        }),
      ]
    );

    // Return new credentials (private key should be encrypted client-side)
    return NextResponse.json({
      success: true,
      did: sessionData.did,
      privateKey: Buffer.from(privateKey).toString('hex'),
      publicKey: Buffer.from(publicKey).toString('hex'),
      message: 'Recovery completed successfully. Save your new private key securely!',
    });
  } catch (error) {
    console.error('Failed to complete recovery:', error);
    return NextResponse.json(
      { error: 'Failed to complete recovery' },
      { status: 500 }
    );
  }
}
