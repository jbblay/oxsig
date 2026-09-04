import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAuth } from '@/lib/auth/middleware';
import { getPool } from '@/lib/db/pool';
import { validateCsrfToken } from '@/lib/security/csrf';
import { checkRateLimit } from '@/lib/security/rate-limit';

export const runtime = 'nodejs';

const createSchema = z.object({
  name: z.string().trim().min(1).max(120),
  description: z.string().trim().max(500).optional().default(''),
}).strict();

function mapSession(row: Record<string, any>) {
  return {
    id: row.id,
    name: row.name,
    description: row.description || '',
    ownerId: row.owner_id,
    currentRole: row.current_role || 'member',
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    members: Array.isArray(row.members) ? row.members : [],
    lastMessage: row.last_message || '',
    lastMessageType: row.last_message_type || null,
    lastMessageAt: row.last_message_at || null,
  };
}

export async function GET(request: NextRequest) {
  return requireAuth(request, async (_req, user) => {
    const result = await getPool().query(
      `SELECT
         c.id,
         c.name,
         c.description,
         c.owner_id,
         c.created_at,
         c.updated_at,
         CASE WHEN c.owner_id = $1 THEN 'owner' ELSE COALESCE(self.role, 'member') END AS current_role,
         COALESCE(
           jsonb_agg(
             jsonb_build_object(
               'id', member_user.id,
               'name', COALESCE(member_user.display_name, member_user.email, 'Oxsig user'),
               'email', member_user.email,
               'avatarUrl', member_user.avatar_url,
               'role', member.role
             ) ORDER BY member.joined_at
           ) FILTER (WHERE member.user_id IS NOT NULL),
           '[]'::jsonb
         ) AS members,
         latest.body AS last_message,
         latest.message_type AS last_message_type,
         latest.created_at AS last_message_at
       FROM collaborations c
       LEFT JOIN collaboration_members self
         ON self.collaboration_id = c.id
        AND self.user_id = $1
        AND self.status = 'active'
       LEFT JOIN collaboration_members member
         ON member.collaboration_id = c.id
        AND member.status = 'active'
       LEFT JOIN users member_user ON member_user.id = member.user_id
       LEFT JOIN LATERAL (
         SELECT m.body, m.message_type, m.created_at
         FROM collaboration_messages m
         WHERE m.collaboration_id = c.id
         ORDER BY m.created_at DESC
         LIMIT 1
       ) latest ON true
       WHERE c.status = 'active'
         AND (c.owner_id = $1 OR self.user_id = $1)
       GROUP BY c.id, self.role, latest.body, latest.message_type, latest.created_at
       ORDER BY COALESCE(latest.created_at, c.updated_at) DESC
       LIMIT 50`,
      [user.id]
    );

    return NextResponse.json({ sessions: result.rows.map(mapSession) });
  });
}

export async function POST(request: NextRequest) {
  return requireAuth(request, async (req, user) => {
    if (!(await validateCsrfToken(req))) {
      return NextResponse.json({ error: 'Invalid or missing CSRF token' }, { status: 403 });
    }

    const rateLimit = await checkRateLimit(req, { maxRequests: 20, windowMs: 60_000 }, user.id);
    if (rateLimit) return rateLimit;

    const parsed = createSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json({ error: 'Enter a session name up to 120 characters' }, { status: 400 });
    }

    const pool = getPool();
    const client = await pool.connect();

    try {
      await client.query('BEGIN');
      const created = await client.query(
        `INSERT INTO collaborations (
           name,
           description,
           owner_id,
           status,
           collaboration_type,
           settings,
           metadata
         )
         VALUES ($1, $2, $3, 'active', 'conversation', '{}'::jsonb, '{}'::jsonb)
         RETURNING id, name, description, owner_id, created_at, updated_at`,
        [parsed.data.name, parsed.data.description, user.id]
      );

      const session = created.rows[0];
      await client.query(
        `INSERT INTO collaboration_members (
           collaboration_id,
           user_id,
           role,
           permissions,
           status,
           invited_by
         )
         VALUES ($1, $2, 'owner', '{"read": true, "write": true, "admin": true}'::jsonb, 'active', $2)
         ON CONFLICT (collaboration_id, user_id) DO UPDATE
         SET role = 'owner',
             permissions = '{"read": true, "write": true, "admin": true}'::jsonb,
             status = 'active'`,
        [session.id, user.id]
      );

      await client.query('COMMIT');

      return NextResponse.json(
        {
          session: mapSession({
            ...session,
            current_role: 'owner',
            members: [{
              id: user.id,
              name: user.name || user.email || 'Oxsig user',
              email: user.email || null,
              avatarUrl: null,
              role: 'owner',
            }],
          }),
        },
        { status: 201 }
      );
    } catch (error) {
      await client.query('ROLLBACK');
      console.error('Create collaboration session failed', error);
      return NextResponse.json({ error: 'Could not create collaboration session' }, { status: 500 });
    } finally {
      client.release();
    }
  });
}
