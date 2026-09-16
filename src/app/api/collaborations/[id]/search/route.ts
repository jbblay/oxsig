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
  return requireAuth(request, async (req, user) => {
    const { id } = await params;
    if (!idSchema.safeParse(id).success) {
      return NextResponse.json({ error: 'Invalid collaboration session' }, { status: 400 });
    }

    const query = new URL(req.url).searchParams.get('q')?.trim() || '';
    if (query.length < 2) return NextResponse.json({ results: [] });
    if (query.length > 120) return NextResponse.json({ error: 'Search query is too long' }, { status: 400 });

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
                u.email
           FROM collaboration_messages m
           JOIN users u ON u.id = m.user_id
          WHERE m.collaboration_id = $1
            AND m.deleted_at IS NULL
            AND m.content ILIKE '%' || $2 || '%'
          ORDER BY m.created_at DESC
          LIMIT 50`,
        [id, query]
      );

      return NextResponse.json({
        results: result.rows.map((row) => ({
          id: row.id,
          text: row.content || '',
          type: row.message_type || 'text',
          createdAt: row.created_at,
          senderName: row.display_name || row.email || 'Member',
          pinned: Boolean(row.pinned_at),
        })),
      });
    } catch (error) {
      console.error('Collaboration message search failed:', error);
      return NextResponse.json({ error: 'Could not search messages' }, { status: 500 });
    }
  });
}