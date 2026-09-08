import { stringifyPostgresJson } from '@/lib/db/postgres-safe';
import 'server-only';

import { createHash, randomBytes } from 'node:crypto';
import { getPool } from '@/lib/db/pool';
import {
  escapeEmailHtml,
  publicAppUrl,
  sendTransactionalEmail,
  type EmailDeliveryResult,
} from '@/lib/email/resend';

const INVITATION_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export class CollaborationInvitationError extends Error {
  constructor(message: string, public readonly status: number) {
    super(message);
    this.name = 'CollaborationInvitationError';
  }
}

function tokenHash(token: string) {
  return createHash('sha256').update(token).digest('hex');
}

export async function createCollaborationInvitation(args: {
  collaborationId: string;
  email: string;
  invitedBy: string;
}) {
  const email = args.email.trim().toLowerCase();
  const rawToken = randomBytes(32).toString('base64url');
  const hash = tokenHash(rawToken);
  const expiresAt = new Date(Date.now() + INVITATION_TTL_MS);
  const pool = getPool();
  const client = await pool.connect();

  try {
    await client.query('BEGIN');
    await client.query(
      `UPDATE collaboration_invitations
       SET status = 'revoked', updated_at = NOW()
       WHERE collaboration_id = $1
         AND lower(email) = $2
         AND status = 'pending'`,
      [args.collaborationId, email]
    );

    const inserted = await client.query(
      `INSERT INTO collaboration_invitations (
         collaboration_id, email, token_hash, invited_by, expires_at
       ) VALUES ($1, $2, $3, $4, $5)
       RETURNING id, expires_at`,
      [args.collaborationId, email, hash, args.invitedBy, expiresAt]
    );
    await client.query('COMMIT');

    return {
      id: inserted.rows[0].id as string,
      email,
      token: rawToken,
      expiresAt: new Date(inserted.rows[0].expires_at).toISOString(),
    };
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

export async function recordInvitationDelivery(
  invitationId: string,
  delivery: EmailDeliveryResult
) {
  const deliveryStatus = !delivery.configured
    ? 'not_configured'
    : delivery.sent
      ? 'sent'
      : 'failed';

  await getPool().query(
    `UPDATE collaboration_invitations
     SET provider = $2,
         provider_message_id = $3,
         delivery_status = $4,
         delivery_error = $5,
         updated_at = NOW()
     WHERE id = $1`,
    [
      invitationId,
      delivery.provider,
      delivery.messageId,
      deliveryStatus,
      delivery.error,
    ]
  );
}

export async function sendCollaborationInvitationEmail(args: {
  invitationId: string;
  token: string;
  email: string;
  collaborationName: string;
  inviterName: string;
  requestOrigin: string;
}) {
  const appUrl = publicAppUrl(args.requestOrigin);
  const acceptUrl = `${appUrl}/collab/invite/${encodeURIComponent(args.token)}`;
  const collaborationName = escapeEmailHtml(args.collaborationName);
  const inviterName = escapeEmailHtml(args.inviterName);
  const safeUrl = escapeEmailHtml(acceptUrl);

  const delivery = await sendTransactionalEmail({
    to: args.email,
    subject: `${args.inviterName} invited you to collaborate in OXSIG`,
    text: `${args.inviterName} invited you to join “${args.collaborationName}” in OXSIG. Accept the invitation: ${acceptUrl}\n\nThis invitation expires in 7 days.`,
    html: `
      <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;color:#111827">
        <h2 style="margin-bottom:12px">You have an OXSIG collaboration invitation</h2>
        <p><strong>${inviterName}</strong> invited you to join <strong>${collaborationName}</strong>.</p>
        <p style="margin:24px 0">
          <a href="${safeUrl}" style="display:inline-block;background:#111827;color:#ffffff;text-decoration:none;padding:12px 18px;border-radius:8px">Accept invitation</a>
        </p>
        <p style="font-size:13px;color:#6b7280">Sign in or create your OXSIG account with this email address. The invitation expires in 7 days.</p>
      </div>
    `,
    tags: [
      { name: 'category', value: 'collaboration_invite' },
    ],
  });

  await recordInvitationDelivery(args.invitationId, delivery);
  return { delivery, acceptUrl };
}

export async function acceptCollaborationInvitation(args: {
  token: string;
  userId: string;
  userEmail: string | null | undefined;
}) {
  const email = String(args.userEmail || '').trim().toLowerCase();
  if (!email) {
    throw new CollaborationInvitationError('Your OXSIG account needs an email address to accept this invitation.', 400);
  }

  const hash = tokenHash(args.token);
  const pool = getPool();
  const invitationResult = await pool.query(
    `SELECT i.id, i.collaboration_id, i.email, i.status, i.expires_at, i.accepted_by,
            c.status AS collaboration_status
     FROM collaboration_invitations i
     JOIN collaborations c ON c.id = i.collaboration_id
     WHERE i.token_hash = $1
     LIMIT 1`,
    [hash]
  );
  const invitation = invitationResult.rows[0];
  if (!invitation) {
    throw new CollaborationInvitationError('This collaboration invitation is invalid.', 404);
  }

  if (invitation.status === 'accepted') {
    if (invitation.accepted_by === args.userId) {
      return { collaborationId: invitation.collaboration_id as string, alreadyAccepted: true };
    }
    throw new CollaborationInvitationError('This collaboration invitation has already been used.', 409);
  }
  if (invitation.status !== 'pending') {
    throw new CollaborationInvitationError('This collaboration invitation is no longer active.', 410);
  }
  if (invitation.collaboration_status !== 'active') {
    throw new CollaborationInvitationError('This collaboration session is no longer active.', 410);
  }
  if (new Date(invitation.expires_at).getTime() <= Date.now()) {
    await pool.query(
      `UPDATE collaboration_invitations
       SET status = 'expired', updated_at = NOW()
       WHERE id = $1 AND status = 'pending'`,
      [invitation.id]
    );
    throw new CollaborationInvitationError('This collaboration invitation has expired.', 410);
  }
  if (String(invitation.email).trim().toLowerCase() !== email) {
    throw new CollaborationInvitationError(
      'Sign in with the email address that received this invitation.',
      403
    );
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const claimed = await client.query(
      `UPDATE collaboration_invitations
       SET status = 'accepted', accepted_by = $2, accepted_at = NOW(), updated_at = NOW()
       WHERE id = $1 AND status = 'pending'
       RETURNING collaboration_id`,
      [invitation.id, args.userId]
    );
    if (!claimed.rowCount) {
      throw new CollaborationInvitationError('This collaboration invitation was already claimed.', 409);
    }

    await client.query(
      `INSERT INTO collaboration_members (
         collaboration_id, user_id, role, permissions, status, invited_by
       )
       SELECT collaboration_id, $2, 'member', $3::jsonb, 'active', invited_by
       FROM collaboration_invitations
       WHERE id = $1
       ON CONFLICT (collaboration_id, user_id)
       DO UPDATE SET status = 'active', role = 'member', permissions = EXCLUDED.permissions`,
      [
        invitation.id,
        args.userId,
        stringifyPostgresJson({ read: true, write: true, admin: false }),
      ]
    );
    await client.query(
      `UPDATE collaborations SET updated_at = NOW() WHERE id = $1`,
      [invitation.collaboration_id]
    );
    await client.query('COMMIT');

    return {
      collaborationId: invitation.collaboration_id as string,
      alreadyAccepted: false,
    };
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}
