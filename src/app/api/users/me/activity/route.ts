import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth/middleware';
import { getPool } from '@/lib/db/pool';

export async function GET(request: NextRequest) {
  return requireAuth(request, async (req, user) => {
    try {
      const rawLimit = Number(new URL(req.url).searchParams.get('limit') || 10);
      const limit = Number.isInteger(rawLimit) ? Math.min(50, Math.max(1, rawLimit)) : 10;
      const result = await getPool().query(
        `SELECT id, action, resource_type, resource_id, metadata, created_at
         FROM audit_logs
         WHERE user_id = $1
         ORDER BY created_at DESC
         LIMIT $2`,
        [user.id, limit]
      );
      return NextResponse.json({
        activities: result.rows.map((row) => ({
          id: row.id,
          action: row.action,
          resourceType: row.resource_type,
          resourceId: row.resource_id,
          metadata: row.metadata,
          createdAt: row.created_at,
        })),
      });
    } catch (error) {
      console.error('Failed to get user activity:', error);
      return NextResponse.json({ error: 'Failed to retrieve activity' }, { status: 500 });
    }
  });
}
