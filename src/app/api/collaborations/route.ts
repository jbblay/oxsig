import { stringifyPostgresJson } from '@/lib/db/postgres-safe';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAuth } from '@/lib/auth/middleware';
import { getPool } from '@/lib/db/pool';
import { captureProductEvent } from '@/lib/analytics/posthog';
import { validateCsrfToken } from '@/lib/security/csrf';
import { checkRateLimit } from '@/lib/security/rate-limit';

export const runtime = 'nodejs';

const createSchema = z.object({
  name: z.string().trim().min(1).max(80),
  description: z.string().trim().max(500).optional(),
}).strict();

export async function GET(request: NextRequest) {
  return requireAuth(request, async (_req, user) => {
    try {
      const result = await getPool().query(
        `SELECT c.id,
                c.name,
                c.description,
                c.owner_id,
                c.collaboration_type,
                c.created_at,
                c.updated_at,
                owner.display_name AS owner_name,
                owner.email AS owner_email,
                mine.last_read_at,
                1 + (
                  SELECT COUNT(*)::int
                  FROM collaboration_members members
                  WHERE members.collaboration_id = c.id
                    AND members.status = 'active'
                    AND members.user_id <> c.owner_id
                ) AS member_count,
                (
                  SELECT COUNT(*)::int
                  FROM collaboration_messages unread
                  WHERE unread.collaboration_id = c.id
                    AND unread.user_id <> $1
                    AND unread.deleted_at IS NULL
                    AND unread.created_at > COALESCE(mine.last_read_at, mine.joined_at, c.created_at)
                ) AS unread_count,
                last_message.content AS last_message,
                last_message.message_type AS last_message_type,
                last_message.created_at AS last_message_at
         FROM collaborations c
         JOIN users owner ON owner.id = c.owner_id
         LEFT JOIN collaboration_members mine
           ON mine.collaboration_id = c.id
          AND mine.user_id = $1
          AND mine.status = 'active'
         LEFT JOIN LATERAL (
           SELECT m.content, m.message_type, m.created_at
           FROM collaboration_messages m
           WHERE m.collaboration_id = c.id
             AND m.deleted_at IS NULL
           ORDER BY m.created_at DESC
           LIMIT 1
         ) last_message ON true
         WHERE c.status = 'active'
           AND (c.owner_id = $1 OR mine.user_id = $1)
         ORDER BY COALESCE(last_message.created_at, c.updated_at) DESC
         LIMIT 100`,
        [user.id]
      );

      return NextResponse.json({
        collaborations: result.rows.map((row) => ({
          id: row.id,
          name: row.name,
          description: row.description || '',
          ownerId: row.owner_id,
          ownerName: row.owner_name || row.owner_email || 'Owner',
          collaborationType: row.collaboration_type || 'chat',
          memberCount: Number(row.member_count || 1),
          unreadCount: Number(row.unread_count || 0),
          lastReadAt: row.last_read_at || null,
          lastMessage: row.last_message || '',
          lastMessageType: row.last_message_type || null,
          lastMessageAt: row.last_message_at || null,
          createdAt: row.created_at,
          updatedAt: row.updated_at,
          isOwner: row.owner_id === user.id,
        })),
      });
    } catch (error) {
      console.error('Collaboration list failed:', error);
      return NextResponse.json({ error: 'Could not load collaboration sessions' }, { status: 500 });
    }
  });
}

export async function POST(request: NextRequest) {
  return requireAuth(request, async (req, user) => {
    if (!(await validateCsrfToken(req))) {
      return NextResponse.json({ error: 'Invalid or missing CSRF token' }, { status: 403 });
    }

    const rateLimit = await checkRateLimit(
      req,
      { maxRequests: 12, windowMs: 60 * 60_000 },
      user.id
    );
    if (rateLimit) return rateLimit;

    const parsed = createSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json({ error: 'Enter a session name up to 80 characters' }, { status: 400 });
    }

    const pool = getPool();
    const client = await pool.connect();
    let committed = false;
    try {
      await client.query('BEGIN');
      const created = await client.query(
        `INSERT INTO collaborations (name, description, owner_id, status, collaboration_type, settings)
         VALUES ($1, $2, $3, 'active', 'chat', $4::jsonb)
         RETURNING id, name, description, owner_id, collaboration_type, created_at, updated_at`,
        [
          parsed.data.name,
          parsed.data.description || null,
          user.id,
          stringifyPostgresJson({ conversationFirst: true }),
        ]
      );

      const row = created.rows[0];
      await client.query(
        `INSERT INTO collaboration_members (
           collaboration_id, user_id, role, permissions, status, invited_by, last_read_at
         )
         VALUES ($1, $2, 'owner', $3::jsonb, 'active', $2, NOW())
         ON CONFLICT (collaboration_id, user_id)
         DO UPDATE SET
           role = 'owner',
           permissions = EXCLUDED.permissions,
           status = 'active',
           last_read_at = COALESCE(collaboration_members.last_read_at, NOW())`,
        [row.id, user.id, stringifyPostgresJson({ read: true, write: true, admin: true })]
      );
      await client.query('COMMIT');
      committed = true;

      await captureProductEvent({
        distinctId: user.clerkUserId || user.id,
        event: 'collaboration_session_created',
        properties: {
          collaboration_type: 'chat',
        },
      });

      return NextResponse.json({
        collaboration: {
          id: row.id,
          name: row.name,
          description: row.description || '',
          ownerId: row.owner_id,
          ownerName: user.name || user.email || 'You',
          collaborationType: row.collaboration_type || 'chat',
          memberCount: 1,
          unreadCount: 0,
          lastReadAt: row.created_at,
          lastMessage: '',
          lastMessageType: null,
          lastMessageAt: null,
          createdAt: row.created_at,
          updatedAt: row.updated_at,
          isOwner: true,
        },
      }, { status: 201 });
    } catch (error) {
      if (!committed) await client.query('ROLLBACK').catch(() => undefined);
      console.error('Collaboration create failed:', error);
      return NextResponse.json({ error: 'Could not create collaboration session' }, { status: 500 });
    } finally {
      client.release();
    }
  });
}
