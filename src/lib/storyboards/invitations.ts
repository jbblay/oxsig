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

export class StoryboardInvitationError extends Error {
  constructor(message: string, public readonly status: number) {
    super(message);
    this.name = 'StoryboardInvitationError';
  }
}

function tokenHash(token: string) {
  return createHash('sha256').update(token).digest('hex');
}

export async function createStoryboardInvitation(args: {
  sessionId: string;
  email: string;
  permission: 'viewer' | 'editor';
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
      `UPDATE storyboard_invitations
       SET status='revoked', updated_at=NOW()
       WHERE session_id=$1 AND lower(email)=$2 AND status='pending'`,
      [args.sessionId, email]
    );
    const inserted = await client.query(
      `INSERT INTO storyboard_invitations (
         session_id, email, permission, token_hash, invited_by, expires_at
       ) VALUES ($1,$2,$3,$4,$5,$6)
       RETURNING id,expires_at`,
      [args.sessionId, email, args.permission, hash, args.invitedBy, expiresAt]
    );
    await client.query('COMMIT');
    return {
      id: inserted.rows[0].id as string,
      email,
      permission: args.permission,
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

export async function recordStoryboardInvitationDelivery(
  invitationId: string,
  delivery: EmailDeliveryResult
) {
  const deliveryStatus = !delivery.configured
    ? 'not_configured'
    : delivery.sent
      ? 'sent'
      : 'failed';

  await getPool().query(
    `UPDATE storyboard_invitations
     SET provider=$2,
         provider_message_id=$3,
         delivery_status=$4,
         delivery_error=$5,
         updated_at=NOW()
     WHERE id=$1`,
    [
      invitationId,
      delivery.provider,
      delivery.messageId,
      deliveryStatus,
      delivery.error,
    ]
  );
}

export async function sendStoryboardInvitationEmail(args: {
  invitationId: string;
  token: string;
  email: string;
  boardTitle: string;
  inviterName: string;
  permission: 'viewer' | 'editor';
  requestOrigin: string;
}) {
  const appUrl = publicAppUrl(args.requestOrigin);
  const acceptUrl = `${appUrl}/collab/storyboards/invite/${encodeURIComponent(args.token)}`;
  const boardTitle = escapeEmailHtml(args.boardTitle);
  const inviterName = escapeEmailHtml(args.inviterName);
  const permission = escapeEmailHtml(args.permission);
  const safeUrl = escapeEmailHtml(acceptUrl);

  const delivery = await sendTransactionalEmail({
    to: args.email,
    subject: `${args.inviterName} shared an OXSIG Board with you`,
    text: `${args.inviterName} shared “${args.boardTitle}” with ${args.permission} access. Accept the invitation: ${acceptUrl}\n\nThis invitation expires in 7 days.`,
    html: `
      <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;color:#111827">
        <h2 style="margin-bottom:12px">An OXSIG Board was shared with you</h2>
        <p><strong>${inviterName}</strong> shared <strong>${boardTitle}</strong> with ${permission} access.</p>
        <p style="margin:24px 0">
          <a href="${safeUrl}" style="display:inline-block;background:#111827;color:#ffffff;text-decoration:none;padding:12px 18px;border-radius:8px">Open shared Board</a>
        </p>
        <p style="font-size:13px;color:#6b7280">Sign in or create your OXSIG account with this email address. The invitation expires in 7 days.</p>
      </div>
    `,
    tags: [{ name: 'category', value: 'storyboard_invite' }],
  });

  await recordStoryboardInvitationDelivery(args.invitationId, delivery);
  return { delivery, acceptUrl };
}

export async function acceptStoryboardInvitation(args: {
  token: string;
  userId: string;
  userEmail: string | null | undefined;
}) {
  const email = String(args.userEmail || '').trim().toLowerCase();
  if (!email) {
    throw new StoryboardInvitationError(
      'Your OXSIG account needs an email address to accept this Board invitation.',
      400
    );
  }

  const hash = tokenHash(args.token);
  const pool = getPool();
  const invitationResult = await pool.query(
    `SELECT invitation.id,
            invitation.session_id,
            invitation.email,
            invitation.permission,
            invitation.status,
            invitation.expires_at,
            invitation.accepted_by,
            session.deleted_at
       FROM storyboard_invitations invitation
       JOIN storyboard_sessions session ON session.id=invitation.session_id
      WHERE invitation.token_hash=$1
      LIMIT 1`,
    [hash]
  );
  const invitation = invitationResult.rows[0];
  if (!invitation) {
    throw new StoryboardInvitationError('This Board invitation is invalid.', 404);
  }
  if (invitation.status === 'accepted') {
    if (invitation.accepted_by === args.userId) {
      return { sessionId: invitation.session_id as string, alreadyAccepted: true };
    }
    throw new StoryboardInvitationError('This Board invitation has already been used.', 409);
  }
  if (invitation.status !== 'pending') {
    throw new StoryboardInvitationError('This Board invitation is no longer active.', 410);
  }
  if (invitation.deleted_at) {
    throw new StoryboardInvitationError('This Board is no longer available.', 410);
  }
  if (new Date(invitation.expires_at).getTime() <= Date.now()) {
    await pool.query(
      `UPDATE storyboard_invitations
       SET status='expired', updated_at=NOW()
       WHERE id=$1 AND status='pending'`,
      [invitation.id]
    );
    throw new StoryboardInvitationError('This Board invitation has expired.', 410);
  }
  if (String(invitation.email).trim().toLowerCase() !== email) {
    throw new StoryboardInvitationError(
      'Sign in with the email address that received this Board invitation.',
      403
    );
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const claimed = await client.query(
      `UPDATE storyboard_invitations
       SET status='accepted', accepted_by=$2, accepted_at=NOW(), updated_at=NOW()
       WHERE id=$1 AND status='pending' AND expires_at > NOW()
       RETURNING session_id,permission,invited_by,expires_at`,
      [invitation.id, args.userId]
    );
    if (!claimed.rowCount) {
      throw new StoryboardInvitationError('This Board invitation was already claimed or expired.', 409);
    }

    const claimedInvitation = claimed.rows[0];
    await client.query(
      `INSERT INTO storyboard_shares (
         session_id,user_id,permission,shared_by,expires_at
       ) VALUES ($1,$2,$3,$4,$5)
       ON CONFLICT (session_id,user_id) DO UPDATE
       SET permission=EXCLUDED.permission,
           shared_by=EXCLUDED.shared_by,
           expires_at=EXCLUDED.expires_at,
           revoked_at=NULL,
           updated_at=NOW()`,
      [
        claimedInvitation.session_id,
        args.userId,
        claimedInvitation.permission,
        claimedInvitation.invited_by,
        claimedInvitation.expires_at,
      ]
    );
    await client.query('COMMIT');
    return {
      sessionId: claimedInvitation.session_id as string,
      alreadyAccepted: false,
    };
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}
