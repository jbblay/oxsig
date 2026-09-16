import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAuth } from '@/lib/auth/middleware';
import { getPool } from '@/lib/db/pool';
import { getCollaborationAccess } from '@/lib/collab/server';

export const runtime = 'nodejs';

const idSchema = z.string().uuid();

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; memberId: string }> }
) {
  return requireAuth(request, async (_req, user) => {
    const { id, memberId } = await params;
    if (!idSchema.safeParse(id).success || !idSchema.safeParse(memberId).success) {
      return NextResponse.json({ error: 'Invalid collaboration member' }, { status: 400 });
    }

    const pool = getPool();
    const access = await getCollaborationAccess(pool, id, user.id);
    if (!access) {
      return NextResponse.json({ error: 'Collaboration not found or access denied' }, { status: 404 });
    }

    const result = await pool.query(
      `SELECT u.id,
              u.display_name,
              u.email,
              u.avatar_url,
              u.bio,
              u.collaboration_status,
              u.collaboration_status_message,
              CASE WHEN c.owner_id = u.id THEN 'owner' ELSE cm.role::text END AS collaboration_role
         FROM collaborations c
         JOIN users u ON u.id = $2 AND u.is_active = true
         LEFT JOIN collaboration_members cm
           ON cm.collaboration_id = c.id
          AND cm.user_id = u.id
          AND cm.status = 'active'
        WHERE c.id = $1
          AND (c.owner_id = u.id OR cm.user_id IS NOT NULL)
        LIMIT 1`,
      [id, memberId]
    );

    const row = result.rows[0];
    if (!row) return NextResponse.json({ error: 'Member not found' }, { status: 404 });

    return NextResponse.json({
      profile: {
        id: row.id,
        displayName: row.display_name || row.email?.split('@')[0] || 'Member',
        email: row.email || null,
        avatarUrl: row.avatar_url || null,
        bio: row.bio || '',
        status: row.collaboration_status || 'available',
        statusMessage: row.collaboration_status_message || '',
        role: row.collaboration_role || 'member',
        isOwnProfile: row.id === user.id,
      },
    });
  });
}
