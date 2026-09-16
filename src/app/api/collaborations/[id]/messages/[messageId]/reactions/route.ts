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
const allowedReactions = ['👍', '❤️', '😂', '🎉', '👀', '✅'] as const;
const reactionSchema = z.object({ emoji: z.enum(allowedReactions) }).strict();

type RouteParams = { params: Promise<{ id: string; messageId: string }> };

export async function POST(request: NextRequest, { params }: RouteParams) {
  return requireAuth(request, async (req, user) => {
    if (!(await validateCsrfToken(req))) {
      return NextResponse.json({ error: 'Invalid or missing CSRF token' }, { status: 403 });
    }

    const { id, messageId } = await params;
    if (!idSchema.safeParse(id).success || !idSchema.safeParse(messageId).success) {
      return NextResponse.json({ error: 'Invalid collaboration message' }, { status: 400 });
    }

    const rateLimit = await checkRateLimit(req, { maxRequests: 90, windowMs: 60_000 }, `${user.id}:${id}:reaction`);
    if (rateLimit) return rateLimit;

    const parsed = reactionSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json({ error: 'Choose a supported reaction' }, { status: 400 });
    }

    const pool = getPool();
    const access = await getCollaborationAccess(pool, id, user.id);
    if (!access) {
      return NextResponse.json({ error: 'Collaboration not found or access denied' }, { status: 404 });
    }

    const message = await pool.query(
      `SELECT id FROM collaboration_messages
        WHERE id = $1 AND collaboration_id = $2 AND deleted_at IS NULL
        LIMIT 1`,
      [messageId, id]
    );
    if (!message.rowCount) {
      return NextResponse.json({ error: 'Message not found' }, { status: 404 });
    }

    try {
      const inserted = await pool.query(
        `INSERT INTO collaboration_message_reactions (message_id, user_id, emoji)
         VALUES ($1, $2, $3)
         ON CONFLICT (message_id, user_id, emoji) DO NOTHING
         RETURNING message_id`,
        [messageId, user.id, parsed.data.emoji]
      );

      const reacted = Boolean(inserted.rowCount);
      if (!reacted) {
        await pool.query(
          `DELETE FROM collaboration_message_reactions
            WHERE message_id = $1 AND user_id = $2 AND emoji = $3`,
          [messageId, user.id, parsed.data.emoji]
        );
      }

      await publishCollaborationEvent({
        collaborationId: id,
        name: 'message.reaction',
        data: { messageId, userId: user.id, emoji: parsed.data.emoji, reacted },
      });

      return NextResponse.json({ ok: true, reacted, emoji: parsed.data.emoji });
    } catch (error) {
      console.error('Collaboration message reaction failed:', error);
      return NextResponse.json({ error: 'Could not update reaction' }, { status: 500 });
    }
  });
}
