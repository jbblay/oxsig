import { stringifyPostgresJson } from '@/lib/db/postgres-safe';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAuth } from '@/lib/auth/middleware';
import { getPool } from '@/lib/db/pool';
import { getCollaborationAccess } from '@/lib/collab/server';
import { publishCollaborationEvent } from '@/lib/realtime/ably';
import { validateCsrfToken } from '@/lib/security/csrf';
import { checkRateLimit } from '@/lib/security/rate-limit';

export const runtime = 'nodejs';

const idSchema = z.string().uuid();
const messageTypeSchema = z.enum(['text', 'explain', 'resource', 'audio', 'practice']);
const messageSchema = z.object({
  text: z.string().max(5000).default(''),
  type: messageTypeSchema.default('text'),
  metadata: z.record(z.string(), z.unknown()).default({}),
}).strict().superRefine((value, ctx) => {
  if (!value.text.trim() && !['resource', 'audio', 'practice'].includes(value.type)) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Message content is required', path: ['text'] });
  }
  const metadataSize = Buffer.byteLength(JSON.stringify(value.metadata), 'utf8');
  if (metadataSize > 16 * 1024) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Message metadata is too large', path: ['metadata'] });
  }
});

function mapMessage(row: Record<string, any>, userId: string) {
  return {
    id: row.id,
    collaborationId: row.collaboration_id,
    text: row.content || '',
    type: row.message_type || 'text',
    metadata: row.metadata || {},
    createdAt: row.created_at,
    editedAt: row.edited_at || null,
    senderId: row.user_id,
    senderName: row.sender_name || row.sender_email || 'Member',
    senderEmail: row.sender_email || null,
    senderAvatar: row.sender_avatar || null,
    isOwnMessage: row.user_id === userId,
  };
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  return requireAuth(request, async (req, user) => {
    const { id } = await params;
    if (!idSchema.safeParse(id).success) {
      return NextResponse.json({ error: 'Invalid collaboration session' }, { status: 400 });
    }

    const pool = getPool();
    const access = await getCollaborationAccess(pool, id, user.id);
    if (!access) {
      return NextResponse.json({ error: 'Collaboration not found or access denied' }, { status: 404 });
    }

    const url = new URL(req.url);
    const requestedLimit = Number.parseInt(url.searchParams.get('limit') || '100', 10);
    const limit = Number.isFinite(requestedLimit) ? Math.max(1, Math.min(150, requestedLimit)) : 100;

    try {
      const result = await pool.query(
        `SELECT m.id,
                m.collaboration_id,
                m.user_id,
                m.content,
                m.message_type,
                m.created_at,
                m.edited_at,
                m.metadata,
                u.display_name AS sender_name,
                u.email AS sender_email,
                u.avatar_url AS sender_avatar
         FROM collaboration_messages m
         JOIN users u ON u.id = m.user_id
         WHERE m.collaboration_id = $1
         ORDER BY m.created_at DESC
         LIMIT $2`,
        [id, limit]
      );

      return NextResponse.json({
        messages: result.rows.reverse().map((row) => mapMessage(row, user.id)),
      });
    } catch (error) {
      console.error('Collaboration messages load failed:', error);
      return NextResponse.json({ error: 'Could not load messages' }, { status: 500 });
    }
  });
}

export async function POST(
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

    const rateLimit = await checkRateLimit(
      req,
      { maxRequests: 90, windowMs: 60_000 },
      `${user.id}:${id}`
    );
    if (rateLimit) return rateLimit;

    const parsed = messageSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0]?.message || 'Invalid message' }, { status: 400 });
    }

    const pool = getPool();
    const access = await getCollaborationAccess(pool, id, user.id);
    if (!access) {
      return NextResponse.json({ error: 'Collaboration not found or access denied' }, { status: 404 });
    }

    try {
      const inserted = await pool.query(
        `INSERT INTO collaboration_messages (collaboration_id, user_id, content, message_type, metadata)
         VALUES ($1, $2, $3, $4, $5::jsonb)
         RETURNING id, collaboration_id, user_id, content, message_type, created_at, edited_at, metadata`,
        [
          id,
          user.id,
          parsed.data.text.trim(),
          parsed.data.type,
          stringifyPostgresJson(parsed.data.metadata),
        ]
      );

      await pool.query(`UPDATE collaborations SET updated_at = NOW() WHERE id = $1`, [id]);
      const sender = await pool.query(
        `SELECT display_name, email, avatar_url FROM users WHERE id = $1 LIMIT 1`,
        [user.id]
      );
      const message = mapMessage({
        ...inserted.rows[0],
        sender_name: sender.rows[0]?.display_name,
        sender_email: sender.rows[0]?.email,
        sender_avatar: sender.rows[0]?.avatar_url,
      }, user.id);

      await publishCollaborationEvent({
        collaborationId: id,
        name: 'message.created',
        data: {
          messageId: message.id,
          senderId: message.senderId,
          type: message.type,
          createdAt: message.createdAt,
        },
      });

      return NextResponse.json({ message }, { status: 201 });
    } catch (error) {
      console.error('Collaboration message send failed:', error);
      return NextResponse.json({ error: 'Could not send message' }, { status: 500 });
    }
  });
}
