import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAuth } from '@/lib/auth/middleware';
import { getPool } from '@/lib/db/pool';
import { startInteractiveLabSession, terminateInteractiveLabSession } from '@/lib/labs/aws-runtime';
import { createTerminalBridgeTicket, terminalBridgeTicketTtlMs } from '@/lib/labs/terminal-bridge-ticket.js';
import { AUDIT_ACTIONS, getRequestMetadata, logAudit } from '@/lib/audit/logger';
import { LiveWorkspaceError } from '@/lib/live-workspace/server';
import {
  assertLiveWorkspaceTerminalAuthorization,
  prepareLiveWorkspaceTerminal,
} from '@/lib/live-workspace/terminal';
import { validateCsrfToken } from '@/lib/security/csrf';
import { checkRateLimit } from '@/lib/security/rate-limit';

export const runtime = 'nodejs';

const idSchema = z.string().uuid();
const startSchema = z.object({ bindingId: z.string().uuid() }).strict();
const endSchema = z.object({
  bindingId: z.string().uuid(),
  sessionId: z.string().min(1).max(128).regex(/^[A-Za-z0-9_.:@-]+$/),
  leaseId: z.string().uuid(),
  labInstanceId: z.string().uuid(),
}).strict();

const PRIVATE_HEADERS = {
  'Cache-Control': 'private, no-store, max-age=0',
  Pragma: 'no-cache',
};

function json(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: PRIVATE_HEADERS });
}

function errorResponse(error: unknown) {
  if (error instanceof LiveWorkspaceError) {
    return json({ error: error.message, code: error.code }, error.status);
  }
  console.error('Live Workspace terminal session failed:', error);
  return json({ error: 'Could not operate the shared terminal session', code: 'SHARED_TERMINAL_FAILED' }, 500);
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return requireAuth(request, async (req, user) => {
    if (!(await validateCsrfToken(req))) return json({ error: 'Invalid or missing CSRF token', code: 'CSRF_FAILED' }, 403);
    const { id } = await params;
    if (!idSchema.safeParse(id).success) return json({ error: 'Invalid Live Workspace', code: 'WORKSPACE_ID_INVALID' }, 400);

    const rateLimit = await checkRateLimit(req, { maxRequests: 10, windowMs: 60_000 }, `${user.id}:${id}:shared-terminal`);
    if (rateLimit) return rateLimit;

    const parsed = startSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return json({ error: 'A valid attached lab binding is required', code: 'TERMINAL_BINDING_INVALID' }, 400);

    try {
      const target = await prepareLiveWorkspaceTerminal({
        pool: getPool(),
        collaborationId: id,
        participantId: user.id,
        bindingId: parsed.data.bindingId,
      });

      const session = await startInteractiveLabSession(target.runtimeExternalId);
      const ticketTtlMs = terminalBridgeTicketTtlMs();
      const bridgeTicket = createTerminalBridgeTicket({
        streamUrl: session.streamUrl,
        region: session.region,
        sessionId: session.sessionId,
        target: target.runtimeExternalId,
        workspaceControl: target.authorization,
      });

      await logAudit({
        userId: user.id,
        action: AUDIT_ACTIONS.LAB_SESSION_START,
        resourceType: 'live-workspace-terminal',
        resourceId: id,
        ...getRequestMetadata(req),
        metadata: {
          provider: 'aws-ssm',
          collaborationId: id,
          bindingId: target.authorization.bindingId,
          labInstanceId: target.authorization.labInstanceId,
          controlLeaseId: target.authorization.leaseId,
          sessionId: session.sessionId,
          target: target.runtimeExternalId,
          region: session.region,
          sharedControl: true,
          websocketAuth: 'encrypted-ticket-plus-live-lease-revalidation',
        },
      });

      return json({
        sessionId: session.sessionId,
        bridgePath: `/__oxsig/terminal-bridge?ticket=${encodeURIComponent(bridgeTicket)}`,
        tokenValue: session.tokenValue,
        bridgeTicketTtlMs: ticketTtlMs,
        bridgeTicketExpiresAt: new Date(Date.now() + ticketTtlMs).toISOString(),
        leaseId: target.authorization.leaseId,
        leaseExpiresAt: target.leaseExpiresAt,
        labInstanceId: target.authorization.labInstanceId,
        bindingId: target.authorization.bindingId,
        region: session.region,
        target: target.runtimeExternalId,
        diagnostics: target.diagnostics,
      });
    } catch (error) {
      if (error instanceof LiveWorkspaceError) return errorResponse(error);
      await logAudit({
        userId: user.id,
        action: AUDIT_ACTIONS.LAB_SESSION_START_FAILED,
        resourceType: 'live-workspace-terminal',
        resourceId: id,
        ...getRequestMetadata(req),
        metadata: {
          provider: 'aws-ssm',
          collaborationId: id,
          bindingId: parsed.data.bindingId,
          sharedControl: true,
          error: error instanceof Error ? error.message.slice(0, 240) : 'SSM shared terminal start failed',
        },
      });
      return json({
        error: error instanceof Error ? error.message : 'Could not start the shared Session Manager shell.',
        code: 'SHARED_TERMINAL_SESSION_START_FAILED',
      }, 503);
    }
  });
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return requireAuth(request, async (req, user) => {
    if (!(await validateCsrfToken(req))) return json({ error: 'Invalid or missing CSRF token', code: 'CSRF_FAILED' }, 403);
    const { id } = await params;
    if (!idSchema.safeParse(id).success) return json({ error: 'Invalid Live Workspace', code: 'WORKSPACE_ID_INVALID' }, 400);

    const rateLimit = await checkRateLimit(req, { maxRequests: 30, windowMs: 60_000 }, `${user.id}:${id}:shared-terminal-end`);
    if (rateLimit) return rateLimit;

    const parsed = endSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return json({ error: 'A valid shared terminal session is required', code: 'TERMINAL_SESSION_INVALID' }, 400);

    try {
      const lease = await assertLiveWorkspaceTerminalAuthorization({
        pool: getPool(),
        authorization: {
          collaborationId: id,
          participantId: user.id,
          bindingId: parsed.data.bindingId,
          labInstanceId: parsed.data.labInstanceId,
          leaseId: parsed.data.leaseId,
          surface: 'terminal',
        },
      });
      if (lease.id !== parsed.data.leaseId) {
        throw new LiveWorkspaceError('The shared terminal lease changed before session cleanup.', 403, 'TERMINAL_CONTROL_LEASE_INACTIVE');
      }

      const target = await getPool().query(
        `SELECT lab.runtime_external_id
           FROM live_workspace_resources resource
           JOIN lab_instances lab ON lab.id=resource.resource_id
          WHERE resource.id=$1
            AND resource.collaboration_id=$2
            AND resource.resource_id=$3
            AND resource.status='attached'
            AND resource.resource_type='lab-instance'
          LIMIT 1`,
        [parsed.data.bindingId, id, parsed.data.labInstanceId]
      );
      const runtimeExternalId = target.rows[0]?.runtime_external_id as string | undefined;
      if (!runtimeExternalId) throw new LiveWorkspaceError('The shared terminal lab target is unavailable.', 409, 'TERMINAL_TARGET_UNAVAILABLE');

      const result = await terminateInteractiveLabSession(runtimeExternalId, parsed.data.sessionId);
      await logAudit({
        userId: user.id,
        action: AUDIT_ACTIONS.LAB_SESSION_END,
        resourceType: 'live-workspace-terminal',
        resourceId: id,
        ...getRequestMetadata(req),
        metadata: {
          provider: 'aws-ssm',
          collaborationId: id,
          bindingId: parsed.data.bindingId,
          labInstanceId: parsed.data.labInstanceId,
          controlLeaseId: parsed.data.leaseId,
          sessionId: parsed.data.sessionId,
          sharedControl: true,
          terminated: result.terminated,
          alreadyEnded: result.alreadyEnded,
        },
      });
      return json(result);
    } catch (error) {
      return errorResponse(error);
    }
  });
}
