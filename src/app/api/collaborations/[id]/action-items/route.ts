import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAuth } from '@/lib/auth/middleware';
import { getPool } from '@/lib/db/pool';
import { getCollaborationAccess } from '@/lib/collab/server';
import { validateCsrfToken } from '@/lib/security/csrf';

export const runtime = 'nodejs';

const idSchema = z.string().uuid();
const createSchema = z.object({
  title: z.string().trim().min(1).max(240),
  messageId: z.string().uuid().nullable().optional(),
}).strict();

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  return requireAuth(request, async (_req, user) => {
    const { id } = await params;
    if (!idSchema.safeParse(id).success) return NextResponse.json({ error: 'Invalid collaboration session' }, { status: 400 });

    const pool = getPool();
    const access = await getCollaborationAccess(pool, id, user.id);
    if (!access) return NextResponse.json({ error: 'Collaboration not found or access denied' }, { status: 404 });

    try {
      const result = await pool.query(
        `SELECT a.id, a.message_id, a.title, a.status, a.created_at, a.completed_at,
                u.display_name, u.email
           FROM collaboration_action_items a
           JOIN users u ON u.id = a.created_by
          WHERE a.collaboration_id = $1
          ORDER BY (a.status = 'open') DESC, a.created_at DESC
          LIMIT 100`,
        [id]
      );
      return NextResponse.json({
        items: result.rows.map((row) => ({
          id: row.id,
          messageId: row.message_id || null,
          title: row.title,
          status: row.status,
          createdAt: row.created_at,
          completedAt: row.completed_at || null,
          createdByName: row.display_name || row.email || 'Member',
        })),
      });
    } catch (error) {
      console.error('Collaboration action items load failed:', error);
      return NextResponse.json({ error: 'Could not load action items' }, { status: 500 });
    }
  });
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  return requireAuth(request, async (req, user) => {
    if (!(await validateCsrfToken(req))) return NextResponse.json({ error: 'Invalid or missing CSRF token' }, { status: 403 });
    const { id } = await params;
    if (!idSchema.safeParse(id).success) return NextResponse.json({ error: 'Invalid collaboration session' }, { status: 400 });

    const parsed = createSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message || 'Invalid action item' }, { status: 400 });

    const pool = getPool();
    const access = await getCollaborationAccess(pool, id, user.id);
    if (!access) return NextResponse.json({ error: 'Collaboration not found or access denied' }, { status: 404 });

    if (parsed.data.messageId) {
      const target = await pool.query(
        `SELECT 1 FROM collaboration_messages WHERE id = $1 AND collaboration_id = $2 AND deleted_at IS NULL LIMIT 1`,
        [parsed.data.messageId, id]
      );
      if (!target.rowCount) return NextResponse.json({ error: 'Source message not found' }, { status: 400 });
    }

    try {
      const result = await pool.query(
        `INSERT INTO collaboration_action_items (collaboration_id, message_id, created_by, title)
         VALUES ($1, $2, $3, $4)
         RETURNING id, message_id, title, status, created_at, completed_at`,
        [id, parsed.data.messageId || null, user.id, parsed.data.title]
      );
      const row = result.rows[0];
      return NextResponse.json({
        item: {
          id: row.id,
          messageId: row.message_id || null,
          title: row.title,
          status: row.status,
          createdAt: row.created_at,
          completedAt: row.completed_at || null,
        },
      }, { status: 201 });
    } catch (error) {
      console.error('Collaboration action item create failed:', error);
      return NextResponse.json({ error: 'Could not create action item' }, { status: 500 });
    }
  });
}