import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAuth } from '@/lib/auth/middleware';
import { getPool } from '@/lib/db/pool';
import { getCollaborationAccess } from '@/lib/collab/server';
import { validateCsrfToken } from '@/lib/security/csrf';

export const runtime = 'nodejs';

const idSchema = z.string().uuid();
const updateSchema = z.object({ status: z.enum(['open', 'done']) }).strict();

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; actionId: string }> }
) {
  return requireAuth(request, async (req, user) => {
    if (!(await validateCsrfToken(req))) return NextResponse.json({ error: 'Invalid or missing CSRF token' }, { status: 403 });
    const { id, actionId } = await params;
    if (!idSchema.safeParse(id).success || !idSchema.safeParse(actionId).success) {
      return NextResponse.json({ error: 'Invalid action item' }, { status: 400 });
    }
    const parsed = updateSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ error: 'Invalid action item update' }, { status: 400 });

    const pool = getPool();
    const access = await getCollaborationAccess(pool, id, user.id);
    if (!access) return NextResponse.json({ error: 'Collaboration not found or access denied' }, { status: 404 });

    try {
      const result = await pool.query(
        `UPDATE collaboration_action_items
            SET status = $3,
                completed_at = CASE WHEN $3 = 'done' THEN NOW() ELSE NULL END
          WHERE id = $1 AND collaboration_id = $2
          RETURNING id, status, completed_at`,
        [actionId, id, parsed.data.status]
      );
      if (!result.rows[0]) return NextResponse.json({ error: 'Action item not found' }, { status: 404 });
      return NextResponse.json({ item: result.rows[0] });
    } catch (error) {
      console.error('Collaboration action item update failed:', error);
      return NextResponse.json({ error: 'Could not update action item' }, { status: 500 });
    }
  });
}