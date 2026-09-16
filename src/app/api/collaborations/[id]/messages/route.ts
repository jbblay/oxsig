import { stringifyPostgresJson } from '@/lib/db/postgres-safe';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAuth } from '@/lib/auth/middleware';
import { getPool } from '@/lib/db/pool';
import { getCollaborationAccess } from '@/lib/collab/server';
import { createWorkspaceNotification } from '@/lib/notifications/server';
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
  replyToId: z.string().uuid().nullable().optional(),
  clientMessageId: z.string().uuid().optional(),
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
  const deleted = Boolean(row.deleted_at);
  const replyTo = row.reply_to_message_id
    ? {
        id: row.reply_to_message_id,
        text: row.reply_deleted_at ? 'Message deleted' : (row.reply_content || ''),
        senderName: row.reply_sender_name || row.reply_sender_email || 'Member',
        deleted: Boolean(row.reply_deleted_at),
      }
    : null;

  return {
    id: row.id,
    collaborationId: row.collaboration_id,
    text: deleted ? '' : (row.content || ''),
    type: row.message_type || 'text',
    metadata: deleted ? {} : (row.metadata || {}),
    createdAt: row.created_at,
    editedAt: row.edited_at || null,
    deletedAt: row.deleted_at || null,
    deleted,
    pinned: Boolean(row.pinned_at),
    pinnedAt: row.pinned_at || null,
    pinnedBy: row.pinned_by || null,
    senderId: row.user_id,
    senderName: row.sender_name || row.sender_email || 'Member',
    senderEmail: row.sender_email || null,
    senderAvatar: row.sender_avatar || null,
    isOwnMessage: row.user_id === userId,
    replyTo,
    reactions: Array.isArray(row.reactions) ? row.reactions : [],
    seenBy: Array.isArray(row.seen_by) ? row.seen_by : [],
  };
}

const MESSAGE_SELECT = `SELECT m.id,
                m.collaboration_id,
                m.user_id,
                m.content,
                m.message_type,
                m.created_at,
                m.edited_at,
                m.deleted_at,
                m.metadata,
                m.reply_to_message_id,
                m.pinned_at,
                m.pinned_by,
                u.display_name AS sender_name,
                u.email AS sender_email,
                u.avatar_url AS sender_avatar,
                parent.content AS reply_content,
                parent.deleted_at AS reply_deleted_at,
                parent_user.display_name AS reply_sender_name,
                parent_user.email AS reply_sender_email,
                COALESCE((
                  SELECT jsonb_agg(
                    jsonb_build_object(
                      'emoji', grouped.emoji,
                      'count', grouped.reaction_count,
                      'reactedByMe', grouped.reacted_by_me
                    ) ORDER BY grouped.emoji
                  )
                  FROM (
                    SELECT r.emoji,
                           COUNT(*)::int AS reaction_count,
                           BOOL_OR(r.user_id = $2) AS reacted_by_me
                    FROM collaboration_message_reactions r
                    WHERE r.message_id = m.id
                    GROUP BY r.emoji
                  ) grouped
                ), '[]'::jsonb) AS reactions,
                COALESCE((
                  SELECT jsonb_agg(
                    jsonb_build_object(
                      'userId', readers.user_id,
                      'displayName', readers.display_name,
                      'avatarUrl', readers.avatar_url,
                      'readAt', readers.last_read_at
                    ) ORDER BY readers.last_read_at DESC
                  )
                  FROM (
                    SELECT cm.user_id,
                           reader.display_name,
                           reader.avatar_url,
                           cm.last_read_at
                    FROM collaboration_members cm
                    JOIN users reader ON reader.id = cm.user_id
                    WHERE cm.collaboration_id = m.collaboration_id
                      AND cm.status = 'active'
                      AND cm.user_id <> m.user_id
                      AND cm.last_read_at >= m.created_at
                  ) readers
                ), '[]'::jsonb) AS seen_by
         FROM collaboration_messages m
         JOIN users u ON u.id = m.user_id
         LEFT JOIN collaboration_messages parent ON parent.id = m.reply_to_message_id
         LEFT JOIN users parent_user ON parent_user.id = parent.user_id`;

async function notifyRecipients(args: {
  pool: ReturnType<typeof getPool>;
  collaborationId: string;
  senderId: string;
  senderName: string;
  messageId: string;
  text: string;
  type: string;
}) {
  const recipients = await args.pool.query(
    `SELECT c.name AS collaboration_name,
            owner.id AS user_id,
            owner.display_name,
            owner.email,
            COALESCE(owner_cm.notification_mode, 'all') AS notification_mode
       FROM collaborations c
       JOIN users owner ON owner.id = c.owner_id
       LEFT JOIN collaboration_members owner_cm
         ON owner_cm.collaboration_id = c.id AND owner_cm.user_id = owner.id AND owner_cm.status = 'active'
      WHERE c.id = $1 AND owner.id <> $2
      UNION ALL
     SELECT c.name AS collaboration_name,
            member.id AS user_id,
            member.display_name,
            member.email,
            COALESCE(cm.notification_mode, 'all') AS notification_mode
       FROM collaboration_members cm
       JOIN collaborations c ON c.id = cm.collaboration_id
       JOIN users member ON member.id = cm.user_id
      WHERE cm.collaboration_id = $1
        AND cm.status = 'active'
        AND cm.user_id <> c.owner_id
        AND cm.user_id <> $2`,
    [args.collaborationId, args.senderId]
  );

  const normalizedText = args.text.toLowerCase();
  await Promise.all(recipients.rows.map(async (row) => {
    const mode = String(row.notification_mode || 'all');
    if (mode === 'muted') return;
    const displayName = String(row.display_name || '').trim().toLowerCase();
    const email = String(row.email || '').trim().toLowerCase();
    const localPart = email.split('@')[0] || '';
    const mentioned = Boolean(
      (displayName && normalizedText.includes(`@${displayName}`))
      || (localPart && normalizedText.includes(`@${localPart}`))
      || (email && normalizedText.includes(email))
    );
    if (mode === 'mentions' && !mentioned) return;

    const collaborationName = String(row.collaboration_name || 'Collaboration');
    const preview = args.text.trim() || (args.type === 'audio' ? 'Voice message' : args.type === 'resource' ? 'Shared resource' : 'New message');
    await createWorkspaceNotification({
      ownerId: row.user_id,
      type: mentioned ? 'collaboration.mention' : 'collaboration.message',
      title: mentioned ? `${args.senderName} mentioned you in ${collaborationName}` : `${args.senderName} in ${collaborationName}`,
      detail: preview.slice(0, 300),
      href: '/collab',
      severity: mentioned ? 'warning' : 'info',
      sourceType: 'collaboration',
      sourceId: args.collaborationId,
      dedupeKey: `collaboration:${args.collaborationId}:message:${args.messageId}:user:${row.user_id}`,
      queryable: args.pool,
    });
  }));
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
        `${MESSAGE_SELECT}
         WHERE m.collaboration_id = $1
         ORDER BY m.created_at DESC
         LIMIT $3`,
        [id, user.id, limit]
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
      let replyRow: Record<string, any> | null = null;
      if (parsed.data.replyToId) {
        const reply = await pool.query(
          `SELECT parent.id,
                  parent.content,
                  parent.deleted_at,
                  sender.display_name AS sender_name,
                  sender.email AS sender_email
           FROM collaboration_messages parent
           JOIN users sender ON sender.id = parent.user_id
           WHERE parent.id = $1
             AND parent.collaboration_id = $2
           LIMIT 1`,
          [parsed.data.replyToId, id]
        );
        replyRow = reply.rows[0] || null;
        if (!replyRow) {
          return NextResponse.json({ error: 'Reply target was not found in this collaboration' }, { status: 400 });
        }
      }

      const inserted = await pool.query(
        `INSERT INTO collaboration_messages (
           collaboration_id, user_id, content, message_type, metadata, reply_to_message_id, client_message_id
         )
         VALUES ($1, $2, $3, $4, $5::jsonb, $6, $7)
         ON CONFLICT (collaboration_id, user_id, client_message_id)
           WHERE client_message_id IS NOT NULL
         DO UPDATE SET client_message_id = EXCLUDED.client_message_id
         RETURNING id, collaboration_id, user_id, content, message_type, created_at, edited_at,
                   deleted_at, metadata, reply_to_message_id, pinned_at, pinned_by`,
        [
          id,
          user.id,
          parsed.data.text.trim(),
          parsed.data.type,
          stringifyPostgresJson(parsed.data.metadata),
          parsed.data.replyToId || null,
          parsed.data.clientMessageId || null,
        ]
      );

      await pool.query(`UPDATE collaborations SET updated_at = NOW() WHERE id = $1`, [id]);
      const sender = await pool.query(
        `SELECT display_name, email, avatar_url FROM users WHERE id = $1 LIMIT 1`,
        [user.id]
      );
      const senderName = sender.rows[0]?.display_name || sender.rows[0]?.email || 'Member';
      const message = mapMessage({
        ...inserted.rows[0],
        sender_name: sender.rows[0]?.display_name,
        sender_email: sender.rows[0]?.email,
        sender_avatar: sender.rows[0]?.avatar_url,
        reply_content: replyRow?.content,
        reply_deleted_at: replyRow?.deleted_at,
        reply_sender_name: replyRow?.sender_name,
        reply_sender_email: replyRow?.sender_email,
        reactions: [],
        seen_by: [],
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

      try {
        await notifyRecipients({
          pool,
          collaborationId: id,
          senderId: user.id,
          senderName,
          messageId: message.id,
          text: message.text,
          type: message.type,
        });
      } catch (notificationError) {
        console.warn('Collaboration message notification failed:', notificationError);
      }

      return NextResponse.json({ message }, { status: 201 });
    } catch (error) {
      console.error('Collaboration message send failed:', error);
      return NextResponse.json({ error: 'Could not send message' }, { status: 500 });
    }
  });
}