import { stringifyPostgresJson } from '@/lib/db/postgres-safe';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAuth } from '@/lib/auth/middleware';
import { getPool } from '@/lib/db/pool';
import { getCollaborationAccess } from '@/lib/collab/server';
import { validateCsrfToken } from '@/lib/security/csrf';

export const runtime = 'nodejs';

const idSchema = z.string().uuid();
const preferenceSchema = z.object({ mode: z.enum(['all', 'mentions', 'muted']) }).strict();

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

    const result = await pool.query(
      `SELECT notification_mode
         FROM collaboration_members
        WHERE collaboration_id = $1 AND user_id = $2 AND status = 'active'
        LIMIT 1`,
      [id, user.id]
    );
    return NextResponse.json({ mode: result.rows[0]?.notification_mode || 'all' });
  });
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  return requireAuth(request, async (req, user) => {
    if (!(await validateCsrfToken(req))) return NextResponse.json({ error: 'Invalid or missing CSRF token' }, { status: 403 });

    const { id } = await params;
    if (!idSchema.safeParse(id).success) return NextResponse.json({ error: 'Invalid collaboration session' }, { status: 400 });
    const parsed = preferenceSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ error: 'Invalid notification preference' }, { status: 400 });

    const pool = getPool();
    const access = await getCollaborationAccess(pool, id, user.id);
    if (!access) return NextResponse.json({ error: 'Collaboration not found or access denied' }, { status: 404 });

    try {
      const updated = await pool.query(
        `UPDATE collaboration_members
            SET notification_mode = $3,
                last_active_at = NOW()
          WHERE collaboration_id = $1 AND user_id = $2 AND status = 'active'
          RETURNING notification_mode`,
        [id, user.id, parsed.data.mode]
      );

      if (!updated.rowCount && access.isOwner) {
        await pool.query(
          `INSERT INTO collaboration_members (
             collaboration_id, user_id, role, permissions, status, invited_by, notification_mode
           ) VALUES ($1, $2, 'owner', $3::jsonb, 'active', $2, $4)
           ON CONFLICT (collaboration_id, user_id)
           DO UPDATE SET role = 'owner', status = 'active', notification_mode = EXCLUDED.notification_mode, last_active_at = NOW()`,
          [id, user.id, stringifyPostgresJson({ read: true, write: true, admin: true }), parsed.data.mode]
        );
      }

      return NextResponse.json({ mode: parsed.data.mode });
    } catch (error) {
      console.error('Collaboration notification preference update failed:', error);
      return NextResponse.json({ error: 'Could not update notification preference' }, { status: 500 });
    }
  });
}