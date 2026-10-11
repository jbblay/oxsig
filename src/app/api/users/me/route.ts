import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAuth } from '@/lib/auth/middleware';
import { isFounderIdentity, resolvePlatformRole } from '@/lib/auth/platform-role';
import { EXPERIENCE_LEVEL_IDS, FOCUS_AREA_IDS, type AccountProfile } from '@/lib/account/profile-contract';
import { getPool } from '@/lib/db/pool';
import { validateCsrfToken } from '@/lib/security/csrf';
import { checkRateLimit } from '@/lib/security/rate-limit';

export const runtime = 'nodejs';

const httpsUrl = z.string().trim().url().max(2000).refine((value) => /^https:\/\//i.test(value), 'Use an https:// link');
const optionalText = (max: number) => z.string().trim().max(max).optional().nullable();

const updateSchema = z.object({
  displayName: z.string().trim().min(2).max(100).optional(),
  bio: optionalText(500),
  avatarUrl: z.union([httpsUrl, z.literal('')]).optional().nullable(),
  headline: optionalText(120),
  location: optionalText(80),
  websiteUrl: z.union([httpsUrl, z.literal('')]).optional().nullable(),
  experienceLevel: z.enum(EXPERIENCE_LEVEL_IDS).optional().nullable(),
  focusAreas: z.array(z.enum(FOCUS_AREA_IDS)).max(8).optional(),
  onboarded: z.literal(true).optional(),
}).strict();

// to_jsonb keeps reads compatible before and after migration 057 is applied.
const SELECT_PROFILE = `SELECT to_jsonb(u) - 'password_hash' AS doc FROM users u WHERE u.id=$1 AND u.is_active=true LIMIT 1`;

function text(value: unknown) {
  return typeof value === 'string' ? value : '';
}

function map(doc: Record<string, any>): AccountProfile {
  const roleInput = { role: doc.role, email: doc.email, email_verified: doc.email_verified };
  return {
    id: doc.id,
    publicKey: text(doc.public_key),
    displayName: text(doc.display_name) || text(doc.email) || 'Oxsig user',
    email: doc.email || undefined,
    bio: text(doc.bio),
    avatarUrl: text(doc.avatar_url),
    headline: text(doc.headline),
    location: text(doc.location),
    websiteUrl: text(doc.website_url),
    experienceLevel: EXPERIENCE_LEVEL_IDS.includes(doc.experience_level) ? doc.experience_level : null,
    focusAreas: Array.isArray(doc.focus_areas) ? doc.focus_areas.filter((area: string) => (FOCUS_AREA_IDS as string[]).includes(area)) : [],
    role: resolvePlatformRole(roleInput),
    isFounder: isFounderIdentity(roleInput),
    isActive: doc.is_active !== false,
    emailVerified: Boolean(doc.email_verified),
    // Missing column (pre-migration) means the user is treated as onboarded.
    onboardedAt: Object.hasOwn(doc, 'onboarded_at') ? doc.onboarded_at ?? null : doc.created_at ?? null,
    createdAt: doc.created_at ?? null,
    updatedAt: doc.updated_at ?? null,
    lastSeenAt: doc.last_seen_at ?? null,
  };
}

export async function GET(request: NextRequest) {
  return requireAuth(request, async (_req, user) => {
    const result = await getPool().query(SELECT_PROFILE, [user.id]);
    if (!result.rows[0]) return NextResponse.json({ error: 'User not found' }, { status: 404 });
    return NextResponse.json({ user: map(result.rows[0].doc) }, { headers: { 'Cache-Control': 'no-store' } });
  });
}

const COLUMN_FOR: Record<string, string> = {
  displayName: 'display_name',
  bio: 'bio',
  avatarUrl: 'avatar_url',
  headline: 'headline',
  location: 'location',
  websiteUrl: 'website_url',
  experienceLevel: 'experience_level',
  focusAreas: 'focus_areas',
};

export async function PATCH(request: NextRequest) {
  return requireAuth(request, async (req, user) => {
    if (!(await validateCsrfToken(req))) return NextResponse.json({ error: 'Invalid or missing CSRF token' }, { status: 403 });
    const rateLimit = await checkRateLimit(req, { maxRequests: 60, windowMs: 60 * 60_000 }, user.id);
    if (rateLimit) return rateLimit;

    const parsed = updateSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success || Object.keys(parsed.data).length === 0) {
      const issue = parsed.success ? null : parsed.error.issues[0];
      return NextResponse.json({ error: issue ? `${issue.path.join('.') || 'profile'}: ${issue.message}` : 'Invalid profile update' }, { status: 400 });
    }

    const sets: string[] = [];
    const values: unknown[] = [];
    for (const [key, column] of Object.entries(COLUMN_FOR)) {
      if (!Object.hasOwn(parsed.data, key)) continue;
      const raw = (parsed.data as Record<string, unknown>)[key];
      let value: unknown = raw;
      if (key === 'focusAreas') value = [...new Set((raw as string[]) ?? [])];
      else if (key === 'displayName') {
        if (!raw) continue;
      } else if (typeof raw === 'string') value = raw.trim() === '' ? null : raw.trim();
      else value = raw ?? null;
      values.push(value);
      sets.push(`${column}=$${values.length}${key === 'focusAreas' ? '::text[]' : ''}`);
    }
    if (parsed.data.onboarded) sets.push('onboarded_at=COALESCE(onboarded_at, NOW())');
    if (sets.length === 0) return NextResponse.json({ error: 'Invalid profile update' }, { status: 400 });

    values.push(user.id);
    const updated = await getPool().query(
      `UPDATE users SET ${sets.join(', ')}, updated_at=NOW() WHERE id=$${values.length} AND is_active=true RETURNING id`,
      values
    );
    if (!updated.rows[0]) return NextResponse.json({ error: 'User not found' }, { status: 404 });

    const result = await getPool().query(SELECT_PROFILE, [user.id]);
    return NextResponse.json({ user: map(result.rows[0].doc) }, { headers: { 'Cache-Control': 'no-store' } });
  });
}
