import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAuth } from '@/lib/auth/middleware';
import { getPool } from '@/lib/db/pool';
import { validateCsrfToken } from '@/lib/security/csrf';
import { checkRateLimit } from '@/lib/security/rate-limit';

export const runtime = 'nodejs';
const idSchema = z.string().uuid();

export async function GET(request: NextRequest) {
  return requireAuth(request, async (req, user) => {
    const rateLimit = await checkRateLimit(req, { maxRequests: 60, windowMs: 60_000 }, user.id);
    if (rateLimit) return rateLimit;

    const result = await getPool().query(
      `SELECT invitation.id, invitation.collaboration_id, invitation.email,
              invitation.status, invitation.delivery_status, invitation.expires_at,
              invitation.created_at, collaboration.name AS collaboration_name
         FROM collaboration_invitations invitation
         JOIN collaborations collaboration ON collaboration.id = invitation.collaboration_id
        WHERE collaboration.owner_id = $1
          AND invitation.status = 'pending'
        ORDER BY invitation.created_at DESC
        LIMIT 100`,
      [user.id]
    );

    return NextResponse.json({
      invitations: result.rows.map((row) => ({
        id: row.id,
        collaborationId: row.collaboration_id,
        collaborationName: row.collaboration_name,
        email: row.email,
        status: row.status,
        deliveryStatus: row.delivery_status,
        expiresAt: new Date(row.expires_at).toISOString(),
        createdAt: new Date(row.created_at).toISOString(),
      })),
    }, { headers: { 'Cache-Control': 'no-store' } });
  });
}

export async function DELETE(request: NextRequest) {
  return requireAuth(request, async (req, user) => {
    if (!(await validateCsrfToken(req))) {
      return NextResponse.json({ error: 'Invalid or missing CSRF token' }, { status: 403 });
    }
    const rateLimit = await checkRateLimit(req, { maxRequests: 30, windowMs: 60 * 60_000 }, user.id);
    if (rateLimit) return rateLimit;

    const invitationId = new URL(req.url).searchParams.get('invitationId') || '';
    if (!idSchema.safeParse(invitationId).success) {
      return NextResponse.json({ error: 'Invalid collaboration invitation' }, { status: 400 });
    }

    const result = await getPool().query(
      `UPDATE collaboration_invitations invitation
          SET status = 'revoked', updated_at = NOW()
         FROM collaborations collaboration
        WHERE invitation.id = $1
          AND invitation.collaboration_id = collaboration.id
          AND collaboration.owner_id = $2
          AND invitation.status = 'pending'
        RETURNING invitation.id`,
      [invitationId, user.id]
    );
    if (!result.rows[0]) {
      return NextResponse.json({ error: 'Pending invitation not found or owner access required' }, { status: 404 });
    }
    return NextResponse.json({ revoked: true });
  });
}
