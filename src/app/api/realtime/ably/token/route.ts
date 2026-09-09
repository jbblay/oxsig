import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAuth } from '@/lib/auth/middleware';
import { getPool } from '@/lib/db/pool';
import { getCollaborationAccess } from '@/lib/collab/server';
import { getActiveControlLease } from '@/lib/live-workspace/control';
import { getLiveWorkspaceAccess } from '@/lib/live-workspace/server';
import { checkRateLimit } from '@/lib/security/rate-limit';
import {
  issueCollaborationRealtimeToken,
  issueLiveTerminalRealtimeToken,
  realtimeProviderConfigured,
} from '@/lib/realtime/ably';

export const runtime = 'nodejs';

const idSchema = z.string().uuid();
const terminalModeSchema = z.enum(['publish', 'subscribe']);

export async function GET(request: NextRequest) {
  return requireAuth(request, async (req, user) => {
    if (!realtimeProviderConfigured()) {
      return NextResponse.json(
        { error: 'Realtime collaboration is not configured', configurationRequired: ['ABLY_API_KEY'] },
        { status: 503 }
      );
    }

    const url = new URL(req.url);
    const collaborationId = url.searchParams.get('collaborationId') || '';
    if (!idSchema.safeParse(collaborationId).success) {
      return NextResponse.json({ error: 'Invalid collaboration session' }, { status: 400 });
    }

    const terminalBindingId = url.searchParams.get('terminalBindingId');
    const terminalLeaseId = url.searchParams.get('terminalLeaseId');
    const terminalMode = url.searchParams.get('terminalMode');
    const terminalRequested = terminalBindingId !== null || terminalLeaseId !== null || terminalMode !== null;

    const rateLimit = await checkRateLimit(
      req,
      { maxRequests: terminalRequested ? 120 : 90, windowMs: 60_000 },
      terminalRequested ? `${user.id}:${collaborationId}:terminal-realtime` : user.id
    );
    if (rateLimit) return rateLimit;

    try {
      if (terminalRequested) {
        const parsedTerminalMode = terminalModeSchema.safeParse(terminalMode);
        if (
          !terminalBindingId || !idSchema.safeParse(terminalBindingId).success ||
          !terminalLeaseId || !idSchema.safeParse(terminalLeaseId).success ||
          !parsedTerminalMode.success
        ) {
          return NextResponse.json({ error: 'Invalid terminal realtime authorization request' }, { status: 400 });
        }

        const pool = getPool();
        const access = await getLiveWorkspaceAccess(pool, collaborationId, user.id);
        if (!access || !access.capabilities.observe) {
          return NextResponse.json({ error: 'Live Workspace not found or access denied' }, { status: 404 });
        }

        const leaseIdentity = await pool.query(
          `SELECT participant_id
             FROM live_workspace_control_leases
            WHERE id=$1
              AND collaboration_id=$2
              AND resource_binding_id=$3
              AND surface='terminal'
              AND status='active'
              AND expires_at > NOW()
            LIMIT 1`,
          [terminalLeaseId, collaborationId, terminalBindingId]
        );
        const controllerId = leaseIdentity.rows[0]?.participant_id as string | undefined;
        if (!controllerId) {
          return NextResponse.json({ error: 'Terminal control lease is no longer active' }, { status: 409 });
        }

        const lease = await getActiveControlLease({
          queryable: pool,
          collaborationId,
          participantId: controllerId,
          bindingId: terminalBindingId,
          surface: 'terminal',
        });
        if (!lease || lease.id !== terminalLeaseId) {
          return NextResponse.json({ error: 'Terminal control lease is no longer active' }, { status: 409 });
        }
        if (parsedTerminalMode.data === 'publish' && controllerId !== user.id) {
          return NextResponse.json({ error: 'Only the active terminal controller can publish terminal output' }, { status: 403 });
        }

        const token = await issueLiveTerminalRealtimeToken({
          collaborationId,
          bindingId: terminalBindingId,
          leaseId: terminalLeaseId,
          clientId: user.id,
          mode: parsedTerminalMode.data,
          leaseExpiresAt: lease.expiresAt,
        });
        if (!token) {
          return NextResponse.json({ error: 'Realtime collaboration is not configured' }, { status: 503 });
        }
        return NextResponse.json(token, { headers: { 'Cache-Control': 'no-store' } });
      }

      const access = await getCollaborationAccess(getPool(), collaborationId, user.id);
      if (!access) {
        return NextResponse.json({ error: 'Collaboration not found or access denied' }, { status: 404 });
      }

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
