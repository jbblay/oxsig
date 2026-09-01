import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth/middleware';
import { getPool } from '@/lib/db/pool';

export async function GET(request: NextRequest) {
  return requireAuth(request, async (_req, user) => {
    try {
      const result = await getPool().query(
        `SELECT
           (SELECT COUNT(*) FROM storyboard_sessions
             WHERE owner_id = $1 AND deleted_at IS NULL) AS owned_storyboards,
           (SELECT COUNT(*) FROM storyboard_shares share
             JOIN storyboard_sessions session ON session.id = share.session_id
             WHERE share.user_id = $1 AND share.revoked_at IS NULL
               AND (share.expires_at IS NULL OR share.expires_at > NOW())
               AND session.deleted_at IS NULL) AS shared_storyboards,
           (SELECT COUNT(*) FROM audit_logs WHERE user_id = $1) AS audit_events,
           (SELECT COUNT(*) FROM sessions
             WHERE user_id = $1 AND revoked_at IS NULL AND expires_at > NOW()) AS active_sessions,
           email_verified, two_factor_enabled
         FROM users WHERE id = $1`,
        [user.id]
      );
      if (!result.rows[0]) return NextResponse.json({ error: 'User not found' }, { status: 404 });
      const row = result.rows[0];
      return NextResponse.json({
        ownedStoryboards: Number(row.owned_storyboards),
        sharedStoryboards: Number(row.shared_storyboards),
        auditEvents: Number(row.audit_events),
        activeSessions: Number(row.active_sessions),
        emailVerified: !!row.email_verified,
        twoFactorEnabled: !!row.two_factor_enabled,
      });
    } catch (error) {
      console.error('Failed to get user stats:', error);
      return NextResponse.json({ error: 'Failed to retrieve profile statistics' }, { status: 500 });
    }
  });
}
