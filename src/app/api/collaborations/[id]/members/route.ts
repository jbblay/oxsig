import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAuth } from '@/lib/auth/middleware';
import { getPool } from '@/lib/db/pool';
import { validateCsrfToken } from '@/lib/security/csrf';
import { checkRateLimit } from '@/lib/security/rate-limit';

export const runtime = 'nodejs';

const inviteSchema = z.object({
  email: z.string().trim().email().max(255),
}).strict();

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  return requireAuth(request, async (req, user) => {
    const { id } = await context.params;
    if (!(await validateCsrfToken(req))) {
      return NextResponse.json({ error: 'Invalid or missing CSRF token' }, { status: 403 });
    }

    const rateLimit = await checkRateLimit(req, { maxRequests: 30, windowMs: 10 * 60_000 }, user.id);
    if (rateLimit) return rateLimit;

    const parsed = inviteSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json({ error: 'Enter a valid email address' }, { status: 400 });
    }

    const pool = getPool();
    const access = await pool.query(
      `SELECT
         c.owner_id,
         CASE WHEN c.owner_id = $2 THEN 'owner' ELSE member.role END AS current_role
       FROM collaborations c
       LEFT JOIN collaboration_members member
         ON member.collaboration_id = c.id
        AND member.user_id = $2
        AND member.status = 'active'
       WHERE c.id = $1
         AND c.status = 'active'
         AND (c.owner_id = $2 OR member.user_id = $2)
       LIMIT 1`,
      [id, user.id]
    );

    if (access.rowCount !== 1) {
      return NextResponse.json({ error: 'Collaboration session not found' }, { status: 404 });
    }
    if (!['owner', 'admin'].includes(access.rows[0].current_role)) {
      return NextResponse.json({ error: 'Only session owners or admins can add people' }, { status: 403 });
    }

    const invitee = await pool.query(
      `SELECT id, display_name, email, avatar_url
       FROM users
       WHERE LOWER(email) = LOWER($1)
         AND is_active = true
       LIMIT 1`,
      [parsed.data.email]
    );

    if (invitee.rowCount !== 1) {
      return NextResponse.json(
        { error: 'No active Oxsig account was found for that email' },
        { status: 404 }
      );
    }

    const target = invitee.rows[0];
    await pool.query(
      `INSERT INTO collaboration_members (
         collaboration_id,
         user_id,
         role,
         permissions,
         status,
         invited_by
       )
       VALUES ($1, $2, 'member', '{"read": true, "write": true, "admin": false}'::jsonb, 'active', $3)
       ON CONFLICT (collaboration_id, user_id) DO UPDATE
       SET status = 'active',
           permissions = '{"read": true, "write": true, "admin": false}'::jsonb,
           invited_by = EXCLUDED.invited_by`,
      [id, target.id, user.id]
    );

    await pool.query(
      `INSERT INTO collaboration_activity (
         collaboration_id,
         user_id,
         activity_type,
         activity_data
       )
       VALUES ($1, $2, 'member_added', $3::jsonb)`,
      [id, user.id, JSON.stringify({ memberId: target.id })]
    );

    return NextResponse.json({
      member: {
        id: target.id,
        name: target.display_name || target.email || 'Oxsig user',
        email: target.email,
        avatarUrl: target.avatar_url || null,
        role: 'member',
      },
    });
  });
}
