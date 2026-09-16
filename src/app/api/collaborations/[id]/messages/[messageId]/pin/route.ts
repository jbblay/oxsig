import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAuth } from '@/lib/auth/middleware';
import { getPool } from '@/lib/db/pool';
import { getCollaborationAccess } from '@/lib/collab/server';
import { publishCollaborationEvent } from '@/lib/realtime/ably';
import { validateCsrfToken } from '@/lib/security/csrf';

export const runtime = 'nodejs';

const idSchema = z.string().uuid();
const pinSchema = z.object({ pinned: z.boolean() }).strict();

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; messageId: string }> }
) {
  return requireAuth(request, async (req, user) => {
    if (!(await validateCsrfToken(req))) {
      return NextResponse.json({ error: 'Invalid or missing CSRF token' }, { status: 403 });
    }

    const { id, messageId } = await params;
    if (!idSchema.safeParse(id).success || !idSchema.safeParse(messageId).success) {
      return NextResponse.json({ error: 'Invalid collaboration message' }, { status: 400 });
    }

    const parsed = pinSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ error: 'Invalid pin update' }, { status: 400 });

    const pool = getPool();
    const access = await getCollaborationAccess(pool, id, user.id);
    if (!access) return NextResponse.json({ error: 'Collaboration not found or access denied' }, { status: 404 });

    try {
      const updated = await pool.query(
        `UPDATE collaboration_messages
            SET pinned_at = CASE WHEN $3::boolean THEN NOW() ELSE NULL END,
                pinned_by = CASE WHEN $3::boolean THEN $4::uuid ELSE NULL END
          WHERE id = $1
            AND collaboration_id = $2
            AND deleted_at IS NULL
          RETURNING id, pinned_at, pinned_by`,
        [messageId, id, parsed.data.pinned, user.id]
      );
      if (!updated.rows[0]) return NextResponse.json({ error: 'Message not found' }, { status: 404 });

      await publishCollaborationEvent({
        collaborationId: id,
        name: 'message.pinned',
        data: { messageId, pinned: parsed.data.pinned, userId: user.id },
      });

      return NextResponse.json({
        ok: true,
        pinned: Boolean(updated.rows[0].pinned_at),
        pinnedAt: updated.rows[0].pinned_at || null,
        pinnedBy: updated.rows[0].pinned_by || null,
      });
    } catch (error) {
      console.error('Collaboration message pin failed:', error);
      return NextResponse.json({ error: 'Could not update pin' }, { status: 500 });
    }
  });
}