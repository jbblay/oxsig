import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAuth } from '@/lib/auth/middleware';
import { getCollaborationAccess } from '@/lib/collab/server';
import { getPool } from '@/lib/db/pool';
import { publishCollaborationEvent } from '@/lib/realtime/ably';
import { validateCsrfToken } from '@/lib/security/csrf';
import { checkRateLimit } from '@/lib/security/rate-limit';

export const runtime = 'nodejs';

const idSchema = z.string().uuid();
const editSchema = z.object({ text: z.string().trim().min(1).max(5000) }).strict();

type RouteParams = { params: Promise<{ id: string; messageId: string }> };

async function authorizeMutation(request: NextRequest, id: string, messageId: string, userId: string) {
  if (!(await validateCsrfToken(request))) {
    return { response: NextResponse.json({ error: 'Invalid or missing CSRF token' }, { status: 403 }) };
  }
  if (!idSchema.safeParse(id).success || !idSchema.safeParse(messageId).success) {
    return { response: NextResponse.json({ error: 'Invalid collaboration message' }, { status: 400 }) };
  }

  const rateLimit = await checkRateLimit(request, { maxRequests: 60, windowMs: 60_000 }, `${userId}:${id}:message-mutation`);
  if (rateLimit) return { response: rateLimit };

  const pool = getPool();
  const access = await getCollaborationAccess(pool, id, userId);
  if (!access) {
    return { response: NextResponse.json({ error: 'Collaboration not found or access denied' }, { status: 404 }) };
  }

  const message = await pool.query(
    `SELECT id, user_id, message_type, deleted_at
       FROM collaboration_messages
      WHERE id = $1 AND collaboration_id = $2
      LIMIT 1`,
    [messageId, id]
  );
  const row = message.rows[0];
  if (!row) {
    return { response: NextResponse.json({ error: 'Message not found' }, { status: 404 }) };
  }
  if (row.user_id !== userId) {
    return { response: NextResponse.json({ error: 'Only the sender can change this message' }, { status: 403 }) };
  }
  if (row.deleted_at) {
    return { response: NextResponse.json({ error: 'Message has already been deleted' }, { status: 409 }) };
  }

  return { pool, row };
}

export async function PATCH(request: NextRequest, { params }: RouteParams) {
  return requireAuth(request, async (req, user) => {
    const { id, messageId } = await params;
    const authorized = await authorizeMutation(req, id, messageId, user.id);
    if ('response' in authorized) return authorized.response;

    const parsed = editSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0]?.message || 'Invalid message edit' }, { status: 400 });
    }
    if (!['text', 'explain'].includes(authorized.row.message_type)) {
      return NextResponse.json({ error: 'Only text messages can be edited' }, { status: 400 });
    }

    try {
      const updated = await authorized.pool.query(
        `UPDATE collaboration_messages
            SET content = $1, edited_at = NOW()
          WHERE id = $2 AND collaboration_id = $3 AND user_id = $4 AND deleted_at IS NULL
          RETURNING edited_at`,
        [parsed.data.text, messageId, id, user.id]
      );
      if (!updated.rowCount) {
        return NextResponse.json({ error: 'Message could not be edited' }, { status: 409 });
      }
      await authorized.pool.query(`UPDATE collaborations SET updated_at = NOW() WHERE id = $1`, [id]);
      await publishCollaborationEvent({
        collaborationId: id,
        name: 'message.updated',
        data: { messageId, senderId: user.id, editedAt: updated.rows[0].edited_at },
      });
      return NextResponse.json({ ok: true, editedAt: updated.rows[0].edited_at });
    } catch (error) {
      console.error('Collaboration message edit failed:', error);
      return NextResponse.json({ error: 'Could not edit message' }, { status: 500 });
    }
  });
}

export async function DELETE(request: NextRequest, { params }: RouteParams) {
  return requireAuth(request, async (req, user) => {
    const { id, messageId } = await params;
    const authorized = await authorizeMutation(req, id, messageId, user.id);
    if ('response' in authorized) return authorized.response;

    try {
      const deleted = await authorized.pool.query(
        `UPDATE collaboration_messages
            SET content = '', metadata = '{}'::jsonb, deleted_at = NOW()
          WHERE id = $1 AND collaboration_id = $2 AND user_id = $3 AND deleted_at IS NULL
          RETURNING deleted_at`,
        [messageId, id, user.id]
      );
      if (!deleted.rowCount) {
        return NextResponse.json({ error: 'Message could not be deleted' }, { status: 409 });
      }
      await authorized.pool.query(`UPDATE collaborations SET updated_at = NOW() WHERE id = $1`, [id]);
      await publishCollaborationEvent({
        collaborationId: id,
        name: 'message.deleted',
        data: { messageId, senderId: user.id, deletedAt: deleted.rows[0].deleted_at },
      });
      return NextResponse.json({ ok: true, deletedAt: deleted.rows[0].deleted_at });
    } catch (error) {
      console.error('Collaboration message delete failed:', error);
      return NextResponse.json({ error: 'Could not delete message' }, { status: 500 });
    }
  });
}
