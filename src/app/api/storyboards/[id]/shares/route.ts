import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth/middleware';
import { getPool } from '@/lib/db/pool';
import { logAudit, getRequestMetadata, AUDIT_ACTIONS } from '@/lib/audit/logger';
import { validateCsrfToken } from '@/lib/security/csrf';
import { canManageStoryboard } from '@/lib/storyboards/access';
import { getStoryboardAccess } from '@/lib/storyboards/server';
import { storyboardIdSchema, storyboardShareSchema } from '@/lib/storyboards/validation';

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(request: NextRequest, { params }: RouteContext) {
  return requireAuth(request, async (_req, user) => {
    const { id } = await params;
    if (!storyboardIdSchema.safeParse(id).success) {
      return NextResponse.json({ error: 'Invalid storyboard ID' }, { status: 400 });
    }
    try {
      const access = await getStoryboardAccess(id, user.id);
      if (!access) return NextResponse.json({ error: 'Storyboard not found' }, { status: 404 });
      if (!canManageStoryboard(access.permission)) {
        return NextResponse.json({ error: 'Only the owner can view shares' }, { status: 403 });
      }
      const result = await getPool().query(
        `SELECT share.user_id, share.permission, share.expires_at, share.created_at,
                target.display_name, target.email
         FROM storyboard_shares share
         JOIN users target ON target.id = share.user_id
         WHERE share.session_id = $1 AND share.revoked_at IS NULL
           AND (share.expires_at IS NULL OR share.expires_at > NOW())
         ORDER BY share.created_at`,
        [id]
      );
      return NextResponse.json({
        shares: result.rows.map((row) => ({
          userId: row.user_id,
          displayName: row.display_name || row.email,
          email: row.email,
          permission: row.permission,
          expiresAt: row.expires_at,
          createdAt: row.created_at,
        })),
      });
    } catch (error) {
      console.error('Failed to list storyboard shares:', error);
      return NextResponse.json({ error: 'Failed to list storyboard shares' }, { status: 500 });
    }
  });
}

export async function POST(request: NextRequest, { params }: RouteContext) {
  return requireAuth(request, async (req, user) => {
    if (!(await validateCsrfToken(req))) {
      return NextResponse.json({ error: 'Invalid or missing CSRF token' }, { status: 403 });
    }
    const { id } = await params;
    if (!storyboardIdSchema.safeParse(id).success) {
      return NextResponse.json({ error: 'Invalid storyboard ID' }, { status: 400 });
    }
    try {
      const access = await getStoryboardAccess(id, user.id);
      if (!access) return NextResponse.json({ error: 'Storyboard not found' }, { status: 404 });
      if (!canManageStoryboard(access.permission)) {
        return NextResponse.json({ error: 'Only the owner can share this storyboard' }, { status: 403 });
      }
      const validation = storyboardShareSchema.safeParse(await req.json());
      if (!validation.success) {
        return NextResponse.json(
          { error: 'Invalid share request', details: validation.error.flatten() },
          { status: 400 }
        );
      }
      const { email, permission, expiresAt } = validation.data;
      if (expiresAt && new Date(expiresAt).getTime() <= Date.now()) {
        return NextResponse.json({ error: 'Expiration must be in the future' }, { status: 400 });
      }

      const targetResult = await getPool().query(
        `SELECT id, display_name, email FROM users
         WHERE lower(email) = $1 AND is_active = true LIMIT 1`,
        [email]
      );
      const target = targetResult.rows[0];
      if (!target) return NextResponse.json({ error: 'No active OXSIG user has that email' }, { status: 404 });
      if (target.id === user.id) {
        return NextResponse.json({ error: 'The owner already has full access' }, { status: 409 });
      }

      await getPool().query(
        `INSERT INTO storyboard_shares
           (session_id, user_id, permission, shared_by, expires_at)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (session_id, user_id) DO UPDATE
         SET permission = EXCLUDED.permission, shared_by = EXCLUDED.shared_by,
             expires_at = EXCLUDED.expires_at, revoked_at = NULL, updated_at = NOW()`,
        [id, target.id, permission, user.id, expiresAt || null]
      );
      await logAudit({
        userId: user.id,
        action: AUDIT_ACTIONS.STORYBOARD_SHARE,
        resourceType: 'storyboard',
        resourceId: id,
        ...getRequestMetadata(req),
        metadata: { targetUserId: target.id, permission, hasExpiration: !!expiresAt },
      });
      return NextResponse.json({
        share: {
          userId: target.id,
          displayName: target.display_name || target.email,
          email: target.email,
          permission,
          expiresAt: expiresAt || null,
          createdAt: new Date().toISOString(),
        },
      }, { status: 201 });
    } catch (error) {
      console.error('Failed to share storyboard:', error);
      return NextResponse.json({ error: 'Failed to share storyboard' }, { status: 500 });
    }
  });
}
