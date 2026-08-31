import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAuth } from '@/lib/auth/middleware';
import { getPool } from '@/lib/db/pool';
import { checkRateLimit, RATE_LIMITS } from '@/lib/security/rate-limit';

const profileSchema = z.object({
  displayName: z.string().trim().max(100).optional(),
  email: z.string().trim().email().max(320).optional(),
  bio: z.string().trim().max(500).optional(),
}).strict().refine((value) => Object.keys(value).length > 0, 'No fields to update');

function mapUser(row: any) {
  return {
    id: row.id,
    displayName: row.display_name,
    email: row.email,
    bio: row.bio,
    role: row.role,
    isActive: row.is_active,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    lastSeenAt: row.last_seen_at,
  };
}

const userColumns = `
  id, display_name, email, bio, role, is_active,
  created_at, updated_at, last_seen_at
`;

export async function GET(request: NextRequest) {
  return requireAuth(request, async (_request, user) => {
    try {
      const result = await getPool().query(
        `SELECT ${userColumns} FROM users WHERE id = $1 AND is_active = true`,
        [user.id],
      );
      if (result.rows.length === 0) {
        return NextResponse.json({ error: 'User not found' }, { status: 404 });
      }
      return NextResponse.json({ user: mapUser(result.rows[0]) });
    } catch (error) {
      console.error('Profile fetch failed:', error);
      return NextResponse.json({ error: 'Failed to fetch profile' }, { status: 500 });
    }
  });
}

export async function PATCH(request: NextRequest) {
  return requireAuth(request, async (authenticatedRequest, user) => {
    const rateLimitResponse = await checkRateLimit(
      authenticatedRequest,
      RATE_LIMITS.API_PROFILE,
      user.id,
    );
    if (rateLimitResponse) return rateLimitResponse;

    try {
      const parsed = profileSchema.safeParse(await authenticatedRequest.json().catch(() => null));
      if (!parsed.success) {
        return NextResponse.json(
          { error: 'Invalid profile', message: parsed.error.issues[0]?.message },
          { status: 400 },
        );
      }

      const updates: string[] = [];
      const values: Array<string | null> = [];
      if (parsed.data.displayName !== undefined) {
        values.push(parsed.data.displayName || null);
        updates.push(`display_name = $${values.length}`);
      }
      if (parsed.data.email !== undefined) {
        values.push(parsed.data.email.toLowerCase());
        updates.push(`email = $${values.length}`);
      }
      if (parsed.data.bio !== undefined) {
        values.push(parsed.data.bio || null);
        updates.push(`bio = $${values.length}`);
      }
      values.push(user.id);

      const result = await getPool().query(
        `UPDATE users
         SET ${updates.join(', ')}, updated_at = NOW()
         WHERE id = $${values.length} AND is_active = true
         RETURNING ${userColumns}`,
        values,
      );
      if (result.rows.length === 0) {
        return NextResponse.json({ error: 'User not found' }, { status: 404 });
      }
      return NextResponse.json({ user: mapUser(result.rows[0]) });
    } catch (error) {
      if ((error as { code?: string }).code === '23505') {
        return NextResponse.json({ error: 'Email is already in use' }, { status: 409 });
      }
      console.error('Profile update failed:', error);
      return NextResponse.json({ error: 'Failed to update profile' }, { status: 500 });
    }
  });
}
