import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import {
  acceptCollaborationInvitation,
  CollaborationInvitationError,
} from '@/lib/collab/invitations';
import { requireAuth } from '@/lib/auth/middleware';
import { validateCsrfToken } from '@/lib/security/csrf';
import { checkRateLimit } from '@/lib/security/rate-limit';

export const runtime = 'nodejs';

const tokenSchema = z.string().regex(/^[A-Za-z0-9_-]{40,100}$/);

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  return requireAuth(request, async (req, user) => {
    if (!(await validateCsrfToken(req))) {
      return NextResponse.json({ error: 'Invalid or missing CSRF token' }, { status: 403 });
    }

    const rateLimit = await checkRateLimit(req, { maxRequests: 20, windowMs: 60 * 60_000 }, user.id);
    if (rateLimit) return rateLimit;

    const { token } = await params;
    if (!tokenSchema.safeParse(token).success) {
      return NextResponse.json({ error: 'Invalid collaboration invitation' }, { status: 400 });
    }

    try {
      const accepted = await acceptCollaborationInvitation({
        token,
        userId: user.id,
        userEmail: user.email,
      });
      return NextResponse.json(accepted);
    } catch (error) {
      if (error instanceof CollaborationInvitationError) {
        return NextResponse.json({ error: error.message }, { status: error.status });
      }
      console.error('Collaboration invitation acceptance failed:', error);
      return NextResponse.json({ error: 'Could not accept collaboration invitation' }, { status: 500 });
    }
  });
}
