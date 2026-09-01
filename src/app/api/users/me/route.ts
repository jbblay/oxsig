import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAuth } from '@/lib/auth/middleware';
import { getPool } from '@/lib/db/pool';
import { validateCsrfToken } from '@/lib/security/csrf';
import { logAudit, getRequestMetadata, AUDIT_ACTIONS } from '@/lib/audit/logger';

const profileUpdateSchema = z.object({
  displayName: z.string().trim().min(2).max(100).optional(),
  bio: z.string().trim().max(500).optional().nullable(),
  avatarUrl: z.union([z.string().url().max(2000), z.literal('')]).optional().nullable(),
}).strict();

function mapUser(row: Record<string, any>) {
  return {
    id: row.id,
    publicKey: row.public_key || '',
    displayName: row.display_name || row.email || 'OXSIG user',
    email: row.email,
    bio: row.bio || '',
    avatarUrl: row.avatar_url || '',
    role: row.role || 'user',
    isActive: row.is_active,
    emailVerified: !!row.email_verified,
    twoFactorEnabled: !!row.two_factor_enabled,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    lastSeenAt: row.last_seen_at,
  };
}

const USER_COLUMNS = `
  id, public_key, display_name, email, bio, avatar_url, role, is_active,
  email_verified, two_factor_enabled, created_at, updated_at, last_seen_at
`;

export async function GET(request: NextRequest) {
  return requireAuth(request, async (_req, user) => {
    try {
      const result = await getPool().query(
        `SELECT ${USER_COLUMNS} FROM users WHERE id = $1 AND is_active = true LIMIT 1`,
        [user.id]
      );
      if (!result.rows[0]) return NextResponse.json({ error: 'User not found' }, { status: 404 });
      return NextResponse.json({ user: mapUser(result.rows[0]) });
    } catch (error) {
      console.error('Error fetching user profile:', error);
      return NextResponse.json({ error: 'Failed to fetch profile' }, { status: 500 });
    }
  });
}

export async function PATCH(request: NextRequest) {
  return requireAuth(request, async (req, user) => {
    if (!(await validateCsrfToken(req))) {
      return NextResponse.json({ error: 'Invalid or missing CSRF token' }, { status: 403 });
    }

    try {
      const validation = profileUpdateSchema.safeParse(await req.json());
      if (!validation.success) {
        return NextResponse.json(
          { error: 'Invalid profile update', details: validation.error.flatten() },
          { status: 400 }
        );
      }
      if (Object.keys(validation.data).length === 0) {
        return NextResponse.json({ error: 'No profile changes supplied' }, { status: 400 });
      }

      const result = await getPool().query(
        `UPDATE users
         SET display_name = COALESCE($1, display_name),
             bio = CASE WHEN $2::boolean THEN $3 ELSE bio END,
             avatar_url = CASE WHEN $4::boolean THEN NULLIF($5, '') ELSE avatar_url END,
             updated_at = NOW()
         WHERE id = $6 AND is_active = true
         RETURNING ${USER_COLUMNS}`,
        [
          validation.data.displayName ?? null,
          Object.hasOwn(validation.data, 'bio'),
          validation.data.bio ?? null,
          Object.hasOwn(validation.data, 'avatarUrl'),
          validation.data.avatarUrl ?? null,
          user.id,
        ]
      );
      if (!result.rows[0]) return NextResponse.json({ error: 'User not found' }, { status: 404 });

      await logAudit({
        userId: user.id,
        action: AUDIT_ACTIONS.PROFILE_UPDATE,
        resourceType: 'user',
        resourceId: user.id,
        ...getRequestMetadata(req),
        metadata: { fields: Object.keys(validation.data) },
      });
      return NextResponse.json({ user: mapUser(result.rows[0]) });
    } catch (error) {
      console.error('Error updating user profile:', error);
      return NextResponse.json({ error: 'Failed to update profile' }, { status: 500 });
    }
  });
}

export async function DELETE(request: NextRequest) {
  return requireAuth(request, async (req, user) => {
    if (!(await validateCsrfToken(req))) {
      return NextResponse.json({ error: 'Invalid or missing CSRF token' }, { status: 403 });
    }
    try {
      const result = await getPool().query(
        `UPDATE users SET is_active = false, updated_at = NOW()
         WHERE id = $1 AND is_active = true RETURNING id`,
        [user.id]
      );
      if (!result.rowCount) return NextResponse.json({ error: 'User not found' }, { status: 404 });
      await getPool().query('UPDATE sessions SET revoked_at = NOW() WHERE user_id = $1 AND revoked_at IS NULL', [user.id]);
      return NextResponse.json({ success: true });
    } catch (error) {
      console.error('Error deactivating user account:', error);
      return NextResponse.json({ error: 'Failed to deactivate account' }, { status: 500 });
    }
  });
}
