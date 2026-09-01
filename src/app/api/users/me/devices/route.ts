import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth/middleware';
import { getPool } from '@/lib/db/pool';
import { validateCsrfToken } from '@/lib/security/csrf';

export async function GET(request: NextRequest) {
  return requireAuth(request, async (_req, user) => {
    try {
      const result = await getPool().query(
        `SELECT id, device_info, ip_address, created_at, expires_at
         FROM sessions
         WHERE user_id = $1 AND revoked_at IS NULL AND expires_at > NOW()
         ORDER BY created_at DESC
         LIMIT 50`,
        [user.id]
      );
      return NextResponse.json({
        devices: result.rows.map((row) => ({
          id: row.id,
          name: row.device_info || 'Unknown browser',
          ipAddress: row.ip_address,
          createdAt: row.created_at,
          expiresAt: row.expires_at,
        })),
      });
    } catch (error) {
      console.error('Failed to get account sessions:', error);
      return NextResponse.json({ error: 'Failed to retrieve account sessions' }, { status: 500 });
    }
  });
}
export async function DELETE(request: NextRequest) {
  return requireAuth(request, async (req, user) => {
    if (!(await validateCsrfToken(req))) {
      return NextResponse.json({ error: 'Invalid or missing CSRF token' }, { status: 403 });
    }
    const sessionId = new URL(req.url).searchParams.get('sessionId');
    if (!sessionId) return NextResponse.json({ error: 'Session ID is required' }, { status: 400 });
    try {
      const result = await getPool().query(
        `UPDATE sessions SET revoked_at = NOW()
         WHERE id = $1 AND user_id = $2 AND revoked_at IS NULL RETURNING id`,
        [sessionId, user.id]
      );
      if (!result.rowCount) return NextResponse.json({ error: 'Session not found' }, { status: 404 });
      return NextResponse.json({ success: true });
    } catch (error) {
      console.error('Failed to revoke account session:', error);
      return NextResponse.json({ error: 'Failed to revoke account session' }, { status: 500 });
    }
  });
}
