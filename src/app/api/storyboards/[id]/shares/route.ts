import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth/middleware';
import { getPool } from '@/lib/db/pool';
import { emailProviderConfigured } from '@/lib/email/server';
import { logAudit, getRequestMetadata, AUDIT_ACTIONS } from '@/lib/audit/logger';
import { publishStoryboardEvent } from '@/lib/realtime/ably';
import { validateCsrfToken } from '@/lib/security/csrf';
import { checkRateLimit } from '@/lib/security/rate-limit';
import { canManageStoryboard } from '@/lib/storyboards/access';
import {
  createStoryboardInvitation,
  sendStoryboardInvitationEmail,
} from '@/lib/storyboards/invitations';
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
      const [grants, invitations] = await Promise.all([
        getPool().query(
          `SELECT share.user_id, share.permission, share.expires_at, share.created_at,
                  target.display_name, target.email
           FROM storyboard_shares share
           JOIN users target ON target.id = share.user_id
           WHERE share.session_id = $1 AND share.revoked_at IS NULL
             AND (share.expires_at IS NULL OR share.expires_at > NOW())
           ORDER BY share.created_at`,
          [id]
        ),
        getPool().query(
          `SELECT id,email,permission,expires_at,created_at
             FROM storyboard_invitations
            WHERE session_id=$1
              AND status='pending'
              AND expires_at > NOW()
            ORDER BY created_at`,
          [id]
        ),
      ]);
      return NextResponse.json({
        shares: [
          ...grants.rows.map((row) => ({
            userId: row.user_id,
            displayName: row.display_name || row.email,
            email: row.email,
            permission: row.permission,
            expiresAt: row.expires_at,
            createdAt: row.created_at,
          })),
          ...invitations.rows.map((row) => ({
            userId: row.id,
            displayName: 'Invitation pending',
            email: row.email,
            permission: row.permission,
            expiresAt: row.expires_at,
            createdAt: row.created_at,
            pendingInvitation: true,
          })),
        ],
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
    const rateLimit = await checkRateLimit(
      req,
      { maxRequests: 20, windowMs: 60 * 60_000 },
      `${user.id}:${id}`
    );
    if (rateLimit) return rateLimit;

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

      const normalizedEmail = email.trim().toLowerCase();
      const targetResult = await getPool().query(
        `SELECT id, display_name, email FROM users
         WHERE lower(email) = $1 AND is_active = true LIMIT 1`,
        [normalizedEmail]
      );
      const target = targetResult.rows[0];

      if (!target) {
        if (!emailProviderConfigured()) {
          return NextResponse.json(
            {
              error: 'Email delivery is not configured. Set RESEND_API_KEY and EMAIL_FROM, then share this Board again.',
              configurationRequired: ['RESEND_API_KEY', 'EMAIL_FROM'],
            },
            { status: 503 }
          );
        }

        const contextResult = await getPool().query(
          `SELECT session.title,
                  COALESCE(inviter.display_name, inviter.email, 'An OXSIG member') AS inviter_name
             FROM storyboard_sessions session
             JOIN users inviter ON inviter.id=$2
            WHERE session.id=$1 AND session.deleted_at IS NULL
            LIMIT 1`,
          [id, user.id]
        );
        const context = contextResult.rows[0];
        if (!context) return NextResponse.json({ error: 'Storyboard not found' }, { status: 404 });

        const invitation = await createStoryboardInvitation({
          sessionId: id,
          email: normalizedEmail,
          permission,
          invitedBy: user.id,
        });
        const { delivery } = await sendStoryboardInvitationEmail({
          invitationId: invitation.id,
          token: invitation.token,
          email: invitation.email,
          boardTitle: context.title as string,
          inviterName: context.inviter_name as string,
          permission,
          requestOrigin: new URL(req.url).origin,
        });
        if (!delivery.sent) {
          return NextResponse.json(
            {
              error: 'The Board invitation was created, but email delivery failed. Share again after email delivery is healthy.',
              invitationId: invitation.id,
            },
            { status: 502 }
          );
        }

        await logAudit({
          userId: user.id,
          action: AUDIT_ACTIONS.STORYBOARD_SHARE,
          resourceType: 'storyboard',
          resourceId: id,
          ...getRequestMetadata(req),
          metadata: {
            invitationId: invitation.id,
            targetEmail: invitation.email,
            permission,
            invitation: true,
          },
        });

        return NextResponse.json({
          share: {
            userId: invitation.id,
            displayName: 'Invitation pending',
            email: invitation.email,
            permission,
            expiresAt: invitation.expiresAt,
            createdAt: new Date().toISOString(),
            pendingInvitation: true,
          },
          message: 'Invitation sent.',
        }, { status: 202 });
      }

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
      await publishStoryboardEvent({
        storyboardId: id,
        name: 'access.changed',
        data: { actorId: user.id, targetUserId: target.id, permission, action: 'granted' },
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
