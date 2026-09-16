import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAuth } from '@/lib/auth/middleware';
import { getPool } from '@/lib/db/pool';
import { getCollaborationAccess } from '@/lib/collab/server';

export const runtime = 'nodejs';

const idSchema = z.string().uuid();

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  return requireAuth(request, async (_req, user) => {
    const { id } = await params;
    if (!idSchema.safeParse(id).success) {
      return NextResponse.json({ error: 'Invalid collaboration session' }, { status: 400 });
    }

    const pool = getPool();
    const access = await getCollaborationAccess(pool, id, user.id);
    if (!access) return NextResponse.json({ error: 'Collaboration not found or access denied' }, { status: 404 });

    try {
      const result = await pool.query(
        `SELECT m.id,
                m.content,
                m.message_type,
                m.created_at,
                m.pinned_at,
                u.display_name,
                u.email,
                p.display_name AS pinned_by_name,
                p.email AS pinned_by_email
           FROM collaboration_messages m
           JOIN users u ON u.id = m.user_id
           LEFT JOIN users p ON p.id = m.pinned_by
          WHERE m.collaboration_id = $1
            AND m.pinned_at IS NOT NULL
            AND m.deleted_at IS NULL
          ORDER BY m.pinned_at DESC
          LIMIT 50`,
        [id]
      );

      return NextResponse.json({
        pins: result.rows.map((row) => ({
          id: row.id,
          text: row.content || '',
          type: row.message_type || 'text',
          createdAt: row.created_at,
          pinnedAt: row.pinned_at,
          senderName: row.display_name || row.email || 'Member',
          pinnedByName: row.pinned_by_name || row.pinned_by_email || 'Member',
        })),
      });
    } catch (error) {
      console.error('Collaboration pins load failed:', error);
      return NextResponse.json({ error: 'Could not load pinned messages' }, { status: 500 });
    }
  });
}