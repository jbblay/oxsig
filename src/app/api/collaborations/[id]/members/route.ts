import { stringifyPostgresJson } from '@/lib/db/postgres-safe';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAuth } from '@/lib/auth/middleware';
import { getPool } from '@/lib/db/pool';
import { getCollaborationAccess } from '@/lib/collab/server';
import {
  createCollaborationInvitation,
  sendCollaborationInvitationEmail,
} from '@/lib/collab/invitations';
import { emailProviderConfigured } from '@/lib/email/resend';
import { createWorkspaceNotification } from '@/lib/notifications/server';
import { publishCollaborationEvent } from '@/lib/realtime/ably';
import { validateCsrfToken } from '@/lib/security/csrf';
import { checkRateLimit } from '@/lib/security/rate-limit';

export const runtime = 'nodejs';

const idSchema = z.string().uuid();
const inviteSchema = z.object({
  email: z.string().trim().email().max(320),
}).strict();

function mapMember(row: Record<string, any>) {
  return {
    id: row.id,
    displayName: row.display_name || row.email?.split('@')[0] || 'Member',
    email: row.email || null,
    avatarUrl: row.avatar_url || null,
    role: row.role,
    isOwner: row.role === 'owner',
  };
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  return requireAuth(request, async (_req, user) => {
    const { id } = await params;
    if (!idSchema.safeParse(id).success) {
      return NextResponse.json({ error: 'Invalid collaboration session' }, { status: 400 });
    }

    const pool = getPool();
    const access = await getCollaborationAccess(pool, id, user.id);
    if (!access) {
      return NextResponse.json({ error: 'Collaboration not found or access denied' }, { status: 404 });
    }

    try {
      const result = await pool.query(
        `SELECT owner.id,
                owner.display_name,
                owner.email,
                owner.avatar_url,
                'owner'::text AS role,
                0 AS sort_order
         FROM collaborations c
         JOIN users owner ON owner.id = c.owner_id
         WHERE c.id = $1
         UNION ALL
         SELECT member.id,
                member.display_name,
                member.email,
                member.avatar_url,
                cm.role::text AS role,
                1 AS sort_order
         FROM collaboration_members cm
         JOIN collaborations c ON c.id = cm.collaboration_id
         JOIN users member ON member.id = cm.user_id
         WHERE cm.collaboration_id = $1
           AND cm.status = 'active'
           AND cm.user_id <> c.owner_id
         ORDER BY sort_order, display_name NULLS LAST, email NULLS LAST`,
        [id]
      );

      return NextResponse.json({
        members: result.rows.map(mapMember),
        canInvite: access.isOwner || access.role === 'admin',
      });
    } catch (error) {
      console.error('Collaboration members load failed:', error);
      return NextResponse.json({ error: 'Could not load session members' }, { status: 500 });
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
      { maxRequests: 20, windowMs: 60 * 60_000 },
      `${user.id}:${id}`
    );
    if (rateLimit) return rateLimit;

    const parsed = inviteSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json({ error: 'Enter a valid email address' }, { status: 400 });
    }

    const pool = getPool();
    const access = await getCollaborationAccess(pool, id, user.id);
    if (!access) {
      return NextResponse.json({ error: 'Collaboration not found or access denied' }, { status: 404 });
    }
    if (!access.isOwner && access.role !== 'admin') {
      return NextResponse.json({ error: 'Only session owners and admins can add members' }, { status: 403 });
    }

    const normalizedEmail = parsed.data.email.trim().toLowerCase();
    const candidate = await pool.query(
      `SELECT id, display_name, email, avatar_url
       FROM users
       WHERE is_active = true AND LOWER(email) = $1
       LIMIT 1`,
      [normalizedEmail]
    );
    const member = candidate.rows[0];

    if (!member) {
      if (!emailProviderConfigured()) {
        return NextResponse.json(
          {
            error: 'External collaboration invitations are ready but email delivery is not configured. Set RESEND_API_KEY and EMAIL_FROM, then invite this person again.',
            configurationRequired: ['RESEND_API_KEY', 'EMAIL_FROM'],
          },
          { status: 503 }
        );
      }

      try {
        const contextResult = await pool.query(
          `SELECT c.name AS collaboration_name,
                  COALESCE(inviter.display_name, inviter.email, 'An OXSIG member') AS inviter_name
           FROM collaborations c
           JOIN users inviter ON inviter.id = $2
           WHERE c.id = $1
           LIMIT 1`,
          [id, user.id]
        );
        const context = contextResult.rows[0];
        if (!context) {
          return NextResponse.json({ error: 'Collaboration session not found' }, { status: 404 });
        }

        const invitation = await createCollaborationInvitation({
          collaborationId: id,
          email: normalizedEmail,
          invitedBy: user.id,
        });
        const { delivery } = await sendCollaborationInvitationEmail({
          invitationId: invitation.id,
          token: invitation.token,
          email: invitation.email,
          collaborationName: context.collaboration_name as string,
          inviterName: context.inviter_name as string,
          requestOrigin: new URL(req.url).origin,
        });

        if (!delivery.sent) {
          return NextResponse.json(
            {
              error: 'The invitation was created, but the email provider could not deliver it. Invite the recipient again after email delivery is healthy.',
              invitationId: invitation.id,
            },
            { status: 502 }
          );
        }

        return NextResponse.json({
          invitation: {
            id: invitation.id,
            email: invitation.email,
            expiresAt: invitation.expiresAt,
            delivery: 'sent',
          },
          message: 'Invitation sent.',
        }, { status: 202 });
      } catch (error) {
        console.error('Collaboration invitation creation failed:', error);
        return NextResponse.json({ error: 'Could not create collaboration invitation' }, { status: 500 });
      }
    }

    if (member.id === access.ownerId) {
      return NextResponse.json({ member: mapMember({ ...member, role: 'owner' }) });
    }

    try {
      await pool.query(
        `INSERT INTO collaboration_members (collaboration_id, user_id, role, permissions, status, invited_by)
         VALUES ($1, $2, 'member', $3::jsonb, 'active', $4)
         ON CONFLICT (collaboration_id, user_id)
         DO UPDATE SET status='active', role='member', permissions=EXCLUDED.permissions, invited_by=EXCLUDED.invited_by`,
        [
          id,
          member.id,
          stringifyPostgresJson({ read: true, write: true, admin: false }),
          user.id,
        ]
      );
      await pool.query(`UPDATE collaborations SET updated_at = NOW() WHERE id = $1`, [id]);
      await publishCollaborationEvent({
        collaborationId: id,
        name: 'members.changed',
        data: { memberId: member.id, action: 'added' },
      });

      try {
        const contextResult = await pool.query(
          `SELECT c.name AS collaboration_name,
                  COALESCE(inviter.display_name, inviter.email, 'An OXSIG member') AS inviter_name
             FROM collaborations c
             JOIN users inviter ON inviter.id = $2
            WHERE c.id = $1
            LIMIT 1`,
          [id, user.id]
        );
        const context = contextResult.rows[0];
        await createWorkspaceNotification({
          ownerId: member.id,
          type: 'collaboration.member_added',
          title: context?.collaboration_name ? `Added to ${context.collaboration_name}` : 'Added to a collaboration',
          detail: `${context?.inviter_name || 'An OXSIG member'} added you to a collaboration workspace.`,
          href: '/collab',
          severity: 'info',
          sourceType: 'collaboration',
          sourceId: id,
          dedupeKey: `collaboration:${id}:member-added:${member.id}`,
          queryable: pool,
        });
      } catch (notificationError) {
        console.warn('Collaboration member notification failed:', notificationError);
      }

      return NextResponse.json({
        member: mapMember({ ...member, role: 'member' }),
      }, { status: 201 });
    } catch (error) {
      console.error('Collaboration invite failed:', error);
      return NextResponse.json({ error: 'Could not add member' }, { status: 500 });
    }
  });
}
