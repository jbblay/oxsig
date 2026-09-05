import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAuth } from '@/lib/auth/middleware';
import { getPool } from '@/lib/db/pool';
import { getCollaborationAccess } from '@/lib/collab/server';
import { checkRateLimit } from '@/lib/security/rate-limit';
import {
  issueCollaborationRealtimeToken,
  realtimeProviderConfigured,
} from '@/lib/realtime/ably';

export const runtime = 'nodejs';

const idSchema = z.string().uuid();

export async function GET(request: NextRequest) {
  return requireAuth(request, async (req, user) => {
    if (!realtimeProviderConfigured()) {
      return NextResponse.json(
        { error: 'Realtime collaboration is not configured', configurationRequired: ['ABLY_API_KEY'] },
        { status: 503 }
      );
    }

    const rateLimit = await checkRateLimit(req, { maxRequests: 90, windowMs: 60_000 }, user.id);
    if (rateLimit) return rateLimit;

    const collaborationId = new URL(req.url).searchParams.get('collaborationId') || '';
    if (!idSchema.safeParse(collaborationId).success) {
      return NextResponse.json({ error: 'Invalid collaboration session' }, { status: 400 });
    }

    const access = await getCollaborationAccess(getPool(), collaborationId, user.id);
    if (!access) {
      return NextResponse.json({ error: 'Collaboration not found or access denied' }, { status: 404 });
    }

    try {
      const token = await issueCollaborationRealtimeToken({ collaborationId, clientId: user.id });
      if (!token) {
        return NextResponse.json({ error: 'Realtime collaboration is not configured' }, { status: 503 });
      }
      return NextResponse.json(token, { headers: { 'Cache-Control': 'no-store' } });
    } catch (error) {
      console.error('Realtime collaboration token issue failed:', error);
      return NextResponse.json({ error: 'Could not authorize realtime collaboration' }, { status: 502 });
    }
  });
}
