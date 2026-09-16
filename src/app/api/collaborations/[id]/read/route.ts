import { stringifyPostgresJson } from '@/lib/db/postgres-safe';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAuth } from '@/lib/auth/middleware';
import { getCollaborationAccess } from '@/lib/collab/server';
import { getPool } from '@/lib/db/pool';
import { publishCollaborationEvent } from '@/lib/realtime/ably';
import { validateCsrfToken } from '@/lib/security/csrf';

export const runtime = 'nodejs';

const idSchema = z.string().uuid();
const readSchema = z.object({ messageId: z.string().uuid().nullable().optional() }).strict();

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  return requireAuth(request, async (req, user) => {
    if (!(await validateCsrfToken(req))) {
      return NextResponse.json({ error: 'Invalid or missing CSRF token' }, { status: 403 });
    }

    const { id } = await params;
    if (!idSchema.safeParse(id).success) {
      return NextResponse.json({ error: 'Invalid collaboration session' }, { status: 400 });
    }

    const parsed = readSchema.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid read cursor' }, { status: 400 });
    }

    const pool = getPool();
    const access = await getCollaborationAccess(pool, id, user.id);
    if (!access) {
      return NextResponse.json({ error: 'Collaboration not found or access denied' }, { status: 404 });
    }

    try {
      let readAt = new Date();
      if (parsed.data.messageId) {
        const target = await pool.query(
          `SELECT created_at
             FROM collaboration_messages
            WHERE id = $1 AND collaboration_id = $2
            LIMIT 1`,
          [parsed.data.messageId, id]
        );
        if (!target.rows[0]) {
          return NextResponse.json({ error: 'Read target was not found' }, { status: 400 });
        }
        readAt = target.rows[0].created_at;
      }

      const updated = await pool.query(
        `UPDATE collaboration_members
            SET last_read_at = GREATEST(COALESCE(last_read_at, 'epoch'::timestamptz), $3::timestamptz),
                last_active_at = NOW()
          WHERE collaboration_id = $1 AND user_id = $2 AND status = 'active'
          RETURNING last_read_at`,
        [id, user.id, readAt]
      );

      let persistedReadAt = updated.rows[0]?.last_read_at || readAt;
      if (!updated.rowCount && access.isOwner) {
        const inserted = await pool.query(
          `INSERT INTO collaboration_members (
             collaboration_id, user_id, role, permissions, status, invited_by, last_read_at
           )
           VALUES ($1, $2, 'owner', $3::jsonb, 'active', $2, $4)
           ON CONFLICT (collaboration_id, user_id)
           DO UPDATE SET
             role = 'owner',
             status = 'active',
             last_read_at = GREATEST(COALESCE(collaboration_members.last_read_at, 'epoch'::timestamptz), EXCLUDED.last_read_at),
             last_active_at = NOW()
           RETURNING last_read_at`,
          [id, user.id, stringifyPostgresJson({ read: true, write: true, admin: true }), readAt]
        );
        persistedReadAt = inserted.rows[0]?.last_read_at || readAt;
      }

      await publishCollaborationEvent({
        collaborationId: id,
        name: 'read.updated',
        data: {
          userId: user.id,
          messageId: parsed.data.messageId || null,
          lastReadAt: new Date(persistedReadAt).toISOString(),
        },
      });

      return NextResponse.json({ ok: true, lastReadAt: persistedReadAt });
    } catch (error) {
      console.error('Collaboration mark-as-read failed:', error);
      return NextResponse.json({ error: 'Could not mark conversation as read' }, { status: 500 });
    }
  });
}