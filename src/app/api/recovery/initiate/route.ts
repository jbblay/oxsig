/**
 * Recovery Initiation API
 * POST /api/recovery/initiate - Start recovery session
 */

import { NextRequest, NextResponse } from 'next/server';
import { getPool } from '@/lib/db/postgres';
import { z } from 'zod';
import { initiateRecovery, type RecoveryPackage } from '@/lib/crypto/social-recovery';

const initiateRecoverySchema = z.object({
  userDid: z.string(),
  // Proof that requester knows something about the account (optional security measure)
  proof: z.string().optional(),
});

/**
 * POST /api/recovery/initiate
 * Anyone can initiate recovery, but only guardians can complete it
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const validation = initiateRecoverySchema.safeParse(body);

    if (!validation.success) {
      return NextResponse.json(
        { error: 'Validation failed', errors: validation.error.errors },
        { status: 400 }
      );
    }

    const { userDid } = validation.data;
    const pool = getPool();

    // Get user by DID
    const userResult = await pool.query(
      `SELECT id FROM users WHERE did = $1`,
      [userDid]
    );

    if (userResult.rows.length === 0) {
      return NextResponse.json(
        { error: 'User not found' },
        { status: 404 }
      );
    }

    const userId = userResult.rows[0].id;

    // Get recovery package
    const pkgResult = await pool.query(
      `SELECT config, guardians FROM recovery_packages WHERE user_id = $1`,
      [userId]
    );

    if (pkgResult.rows.length === 0) {
      return NextResponse.json(
        { error: 'No recovery package configured' },
        { status: 404 }
      );
    }

    const recoveryPackage: RecoveryPackage = {
      config: pkgResult.rows[0].config,
      guardians: pkgResult.rows[0].guardians,
      encryptedMasterKey: '',
      createdAt: 0,
      updatedAt: 0,
    };

    // Check if there's an active recovery session
    const activeSession = await pool.query(
      `SELECT id, status, expires_at FROM recovery_sessions
       WHERE user_id = $1 AND status IN ('pending', 'time-locked', 'ready')
       ORDER BY created_at DESC LIMIT 1`,
      [userId]
    );

    if (activeSession.rows.length > 0) {
      const session = activeSession.rows[0];
      if (new Date(session.expires_at) > new Date()) {
        return NextResponse.json(
          {
            error: 'Active recovery session already exists',
            sessionId: session.id,
          },
          { status: 409 }
        );
      }
    }

    // Initiate new recovery session
    const session = initiateRecovery(userDid, recoveryPackage);

    // Store session in database
    await pool.query(
      `INSERT INTO recovery_sessions 
       (id, user_id, initiated_at, can_complete_at, threshold, expires_at, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [
        session.id,
        userId,
        new Date(session.initiatedAt),
        new Date(session.canCompleteAt),
        session.threshold,
        new Date(session.expiresAt),
        session.status,
      ]
    );

    // Log activity
    await pool.query(
      `INSERT INTO activity_log (user_id, action, entity_type, entity_id, metadata)
       VALUES ($1, 'INITIATE_RECOVERY', 'recovery', $2, $3)`,
      [
        userId,
        session.id,
        JSON.stringify({
          threshold: session.threshold,
          canCompleteAt: session.canCompleteAt,
          expiresAt: session.expiresAt,
        }),
      ]
    );

    // Notify guardians (via push notifications, not email!)
    // This would be implemented separately using the notification system

    return NextResponse.json({
      sessionId: session.id,
      status: session.status,
      threshold: session.threshold,
      canCompleteAt: session.canCompleteAt,
      expiresAt: session.expiresAt,
      guardians: recoveryPackage.guardians.map(g => ({
        did: g.did,
        displayName: g.displayName,
      })),
    });
  } catch (error) {
    console.error('Failed to initiate recovery:', error);
    return NextResponse.json(
      { error: 'Failed to initiate recovery' },
      { status: 500 }
    );
  }
}
