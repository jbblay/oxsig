/**
 * Recovery Session Status API
 * GET /api/recovery/initiate/[sessionId] - Get recovery session status
 */

import { NextRequest, NextResponse } from 'next/server';
import { getPool } from '@/lib/db/postgres';

/**
 * GET /api/recovery/initiate/[sessionId]
 * Get recovery session status
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ sessionId: string }> }
) {
  try {
    const { sessionId } = await params;
    const pool = getPool();

    const result = await pool.query(
      `SELECT 
         rs.id, rs.user_id, rs.initiated_at, rs.can_complete_at,
         rs.threshold, rs.expires_at, rs.status,
         rs.collected_shares_count, rs.responded_guardians,
         u.did as user_did
       FROM recovery_sessions rs
       JOIN users u ON rs.user_id = u.id
       WHERE rs.id = $1`,
      [sessionId]
    );

    if (result.rows.length === 0) {
      return NextResponse.json(
        { error: 'Recovery session not found' },
        { status: 404 }
      );
    }

    const session = result.rows[0];

    return NextResponse.json({
      sessionId: session.id,
      userDid: session.user_did,
      initiatedAt: session.initiated_at,
      canCompleteAt: session.can_complete_at,
      threshold: session.threshold,
      expiresAt: session.expires_at,
      status: session.status,
      collectedSharesCount: session.collected_shares_count,
      respondedGuardians: session.responded_guardians,
    });
  } catch (error) {
    console.error('Failed to get recovery session:', error);
    return NextResponse.json(
      { error: 'Failed to get recovery session status' },
      { status: 500 }
    );
  }
}
