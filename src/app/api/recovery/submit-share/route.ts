/**
 * Guardian Share Submission API
 * POST /api/recovery/submit-share - Guardian submits their share
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth/middleware';
import { getPool } from '@/lib/db/postgres';
import { z } from 'zod';
import { submitGuardianShare, type ShamirShare } from '@/lib/crypto/social-recovery';

const submitShareSchema = z.object({
  sessionId: z.string(),
  share: z.object({
    id: z.number(),
    data: z.string(),
    threshold: z.number(),
    total: z.number(),
    created: z.number(),
  }),
});

/**
 * POST /api/recovery/submit-share
 * Guardian submits their decrypted share
 */
export async function POST(request: NextRequest) {
  return requireAuth(request, async (req, user) => {
    try {
      const body = await req.json();
      const validation = submitShareSchema.safeParse(body);

      if (!validation.success) {
        return NextResponse.json(
          { error: 'Validation failed', errors: validation.error.errors },
          { status: 400 }
        );
      }

      const { sessionId, share } = validation.data;
      const pool = getPool();

      // Get recovery session
      const sessionResult = await pool.query(
        `SELECT 
           rs.*,
           u.did as user_did,
           rp.guardians
         FROM recovery_sessions rs
         JOIN users u ON rs.user_id = u.id
         JOIN recovery_packages rp ON rs.user_id = rp.user_id
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

      // Verify user is a guardian
      const guardians = sessionData.guardians;
      const guardian = guardians.find((g: any) => g.did === user.did);

      if (!guardian || !user.did) {
        return NextResponse.json(
          { error: 'You are not a guardian for this recovery' },
          { status: 403 }
        );
      }

      // Check if session is still active
      if (!['pending', 'time-locked', 'ready'].includes(sessionData.status)) {
        return NextResponse.json(
          { error: 'Recovery session is not active' },
          { status: 400 }
        );
      }

      if (new Date(sessionData.expires_at) < new Date()) {
        return NextResponse.json(
          { error: 'Recovery session has expired' },
          { status: 400 }
        );
      }

      // Check if guardian already submitted
      const respondedGuardians = sessionData.responded_guardians || [];
      if (respondedGuardians.includes(user.did)) {
        return NextResponse.json(
          { error: 'You have already submitted your share' },
          { status: 400 }
        );
      }

      // Get current collected shares
      const sharesResult = await pool.query(
        `SELECT shares FROM recovery_session_shares WHERE session_id = $1`,
        [sessionId]
      );

      const currentShares: ShamirShare[] = sharesResult.rows.length > 0
        ? sharesResult.rows[0].shares
        : [];

      // Create session object for submitGuardianShare
      const session = {
        id: sessionData.id,
        userDid: sessionData.user_did,
        initiatedAt: new Date(sessionData.initiated_at).getTime(),
        canCompleteAt: new Date(sessionData.can_complete_at).getTime(),
        collectedShares: currentShares,
        respondedGuardians,
        threshold: sessionData.threshold,
        expiresAt: new Date(sessionData.expires_at).getTime(),
        status: sessionData.status,
      };

      // Submit share
      const updatedSession = submitGuardianShare(session, user.did, share as ShamirShare);

      // Update session in database
      await pool.query(
        `UPDATE recovery_sessions
         SET status = $1,
             collected_shares_count = $2,
             responded_guardians = $3,
             updated_at = NOW()
         WHERE id = $4`,
        [
          updatedSession.status,
          updatedSession.collectedShares.length,
          JSON.stringify(updatedSession.respondedGuardians),
          sessionId,
        ]
      );

      // Store shares
      if (sharesResult.rows.length === 0) {
        await pool.query(
          `INSERT INTO recovery_session_shares (session_id, shares)
           VALUES ($1, $2)`,
          [sessionId, JSON.stringify(updatedSession.collectedShares)]
        );
      } else {
        await pool.query(
          `UPDATE recovery_session_shares SET shares = $1 WHERE session_id = $2`,
          [JSON.stringify(updatedSession.collectedShares), sessionId]
        );
      }

      // Log activity
      await pool.query(
        `INSERT INTO activity_log (user_id, action, entity_type, entity_id, metadata)
         VALUES ($1, 'SUBMIT_RECOVERY_SHARE', 'recovery', $2, $3)`,
        [
          user.id,
          sessionId,
          JSON.stringify({
            shareId: share.id,
            collectedShares: updatedSession.collectedShares.length,
            threshold: updatedSession.threshold,
          }),
        ]
      );

      return NextResponse.json({
        success: true,
        sessionId,
        status: updatedSession.status,
        collectedShares: updatedSession.collectedShares.length,
        threshold: updatedSession.threshold,
        canComplete: updatedSession.status === 'ready',
      });
    } catch (error) {
      console.error('Failed to submit share:', error);
      return NextResponse.json(
        { error: 'Failed to submit share' },
        { status: 500 }
      );
    }
  });
}
