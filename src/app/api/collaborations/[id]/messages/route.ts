import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAuth } from '@/lib/auth/middleware';
import { getPool } from '@/lib/db/pool';
import { validateCsrfToken } from '@/lib/security/csrf';
import { checkRateLimit } from '@/lib/security/rate-limit';

export const runtime = 'nodejs';

const messageSchema = z.object({
  messageType: z.enum(['text', 'explain', 'resource', 'audio', 'practice']),
  body: z.string().trim().max(4000).optional().default(''),
  metadata: z.record(z.unknown()).optional().default({}),
}).strict();

async function hasAccess(collaborationId: string, userId: string) {
  const result = await getPool().query(
    `SELECT c.id
     FROM collaborations c
     LEFT JOIN collaboration_members member
       ON member.collaboration_id = c.id
      AND member.user_id = $2
      AND member.status = 'active'
     WHERE c.id = $1
       AND c.status = 'active'
       AND (c.owner_id = $2 OR member.user_id = $2)
     LIMIT 1`,
    [collaborationId, userId]
  );
  return result.rowCount === 1;
}

function mapMessage(row: Record<string, any>, currentUserId: string) {
  return {
    id: row.id,
    collaborationId: row.collaboration_id,
    senderId: row.sender_id,
    senderName: row.sender_name || row.sender_email || 'Oxsig user',
    senderEmail: row.sender_email || null,
    senderAvatarUrl: row.sender_avatar_url || null,
    messageType: row.message_type,
    body: row.body || '',
    metadata: row.metadata || {},
    createdAt: row.created_at,
    mine: row.sender_id === currentUserId,
  };
}

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  return requireAuth(request, async (_req, user) => {
    const { id } = await context.params;
    if (!(await hasAccess(id, user.id))) {
      return NextResponse.json({ error: 'Collaboration session not found' }, { status: 404 });
    }

    const result = await getPool().query(
      `SELECT
         message.id,
         message.collaboration_id,
         message.sender_id,
         message.message_type,
         message.body,
         message.metadata,
         message.created_at,
         sender.display_name AS sender_name,
         sender.email AS sender_email,
         sender.avatar_url AS sender_avatar_url
       FROM collaboration_messages message
       JOIN users sender ON sender.id = message.sender_id
       WHERE message.collaboration_id = $1
       ORDER BY message.created_at ASC
       LIMIT 250`,
      [id]
    );

    return NextResponse.json({
      messages: result.rows.map((row) => mapMessage(row, user.id)),
    });
  });
}

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  return requireAuth(request, async (req, user) => {
    const { id } = await context.params;
    if (!(await validateCsrfToken(req))) {
      return NextResponse.json({ error: 'Invalid or missing CSRF token' }, { status: 403 });
    }

    const rateLimit = await checkRateLimit(req, { maxRequests: 120, windowMs: 60_000 }, user.id);
    if (rateLimit) return rateLimit;

    if (!(await hasAccess(id, user.id))) {
      return NextResponse.json({ error: 'Collaboration session not found' }, { status: 404 });
    }

    const parsed = messageSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid collaboration message' }, { status: 400 });
    }

    const { messageType, body, metadata } = parsed.data;
    if ((messageType === 'text' || messageType === 'explain') && !body) {
      return NextResponse.json({ error: 'Message text is required' }, { status: 400 });
    }
    if ((messageType === 'resource' || messageType === 'audio') && typeof metadata.url !== 'string') {
      return NextResponse.json({ error: 'Attached resource is missing its file URL' }, { status: 400 });
    }

    const pool = getPool();
    const result = await pool.query(
      `WITH inserted AS (
         INSERT INTO collaboration_messages (
           collaboration_id,
           sender_id,
           message_type,
           body,
           metadata
         )
         VALUES ($1, $2, $3, $4, $5::jsonb)
         RETURNING *
       )
       SELECT
         inserted.*,
         sender.display_name AS sender_name,
         sender.email AS sender_email,
         sender.avatar_url AS sender_avatar_url
       FROM inserted
       JOIN users sender ON sender.id = inserted.sender_id`,
      [id, user.id, messageType, body, JSON.stringify(metadata)]
    );

    await Promise.all([
      pool.query(`UPDATE collaborations SET updated_at = NOW() WHERE id = $1`, [id]),
      pool.query(
        `INSERT INTO collaboration_activity (
           collaboration_id,
           user_id,
           activity_type,
           activity_data
         )
         VALUES ($1, $2, 'message_sent', $3::jsonb)`,
        [id, user.id, JSON.stringify({ messageType })]
      ),
    ]);

    return NextResponse.json(
      { message: mapMessage(result.rows[0], user.id) },
      { status: 201 }
    );
  });
}
