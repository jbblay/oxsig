import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAuth } from '@/lib/auth/middleware';
import { getPool } from '@/lib/db/pool';
import { validateCsrfToken } from '@/lib/security/csrf';

const updateSchema = z.object({
  displayName: z.string().trim().min(2).max(100).optional(),
  bio: z.string().trim().max(500).optional().nullable(),
  avatarUrl: z.union([z.string().url().max(2000), z.literal('')]).optional().nullable(),
}).strict();

const columns = `id, public_key, display_name, email, bio, avatar_url, role, is_active, email_verified, created_at, updated_at, last_seen_at`;
function map(row: Record<string, any>) {
  return { id: row.id, publicKey: row.public_key || '', displayName: row.display_name || row.email || 'Oxsig user', email: row.email, bio: row.bio || '', avatarUrl: row.avatar_url || '', role: row.role || 'user', isActive: row.is_active, emailVerified: Boolean(row.email_verified), createdAt: row.created_at, updatedAt: row.updated_at, lastSeenAt: row.last_seen_at };
}

export async function GET(request: NextRequest) {
  return requireAuth(request, async (_req, user) => {
    const result = await getPool().query(`SELECT ${columns} FROM users WHERE id=$1 AND is_active=true LIMIT 1`, [user.id]);
    if (!result.rows[0]) return NextResponse.json({ error: 'User not found' }, { status: 404 });
    return NextResponse.json({ user: map(result.rows[0]) });
  });
}

export async function PATCH(request: NextRequest) {
  return requireAuth(request, async (req, user) => {
    if (!(await validateCsrfToken(req))) return NextResponse.json({ error: 'Invalid or missing CSRF token' }, { status: 403 });
    const parsed = updateSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success || Object.keys(parsed.data).length === 0) return NextResponse.json({ error: 'Invalid profile update' }, { status: 400 });
    const result = await getPool().query(`UPDATE users SET display_name=COALESCE($1,display_name), bio=CASE WHEN $2::boolean THEN $3 ELSE bio END, avatar_url=CASE WHEN $4::boolean THEN NULLIF($5,'') ELSE avatar_url END, updated_at=NOW() WHERE id=$6 AND is_active=true RETURNING ${columns}`, [parsed.data.displayName ?? null, Object.hasOwn(parsed.data, 'bio'), parsed.data.bio ?? null, Object.hasOwn(parsed.data, 'avatarUrl'), parsed.data.avatarUrl ?? null, user.id]);
    if (!result.rows[0]) return NextResponse.json({ error: 'User not found' }, { status: 404 });
    return NextResponse.json({ user: map(result.rows[0]) });
  });
}
