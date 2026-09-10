import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAuth } from '@/lib/auth/middleware';
import { validateCsrfToken } from '@/lib/security/csrf';
import { checkRateLimit } from '@/lib/security/rate-limit';
import { getPool } from '@/lib/db/pool';
import { ensureDesktopRuntime, inspectDesktopService, startDesktopPortSession } from '@/lib/labs/desktop-runtime';
import { terminateInteractiveLabSession } from '@/lib/labs/aws-runtime';
import { createTerminalBridgeTicket, terminalBridgeTicketTtlMs } from '@/lib/labs/terminal-bridge-ticket.js';
import { getLabTerminalDiagnostics, type LabTerminalDiagnostics } from '@/lib/labs/terminal-observability';
import { AUDIT_ACTIONS, getRequestMetadata, logAudit } from '@/lib/audit/logger';

export const runtime = 'nodejs';

const uuidSchema = z.string().uuid();
const endSessionSchema = z.object({
  sessionId: z.string().min(1).max(128).regex(/^[A-Za-z0-9_.:@-]+$/),
}).strict();

const PRIVATE_HEADERS = {
  'Cache-Control': 'private, no-store, max-age=0',
  Pragma: 'no-cache',
};

function json(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: PRIVATE_HEADERS });
}

function failure(status: number, code: string, error: string, stage: string, diagnostics?: LabTerminalDiagnostics) {
  return json({ error, code, stage, diagnostics }, status);
}

type OperationNodeRow = {
  id: string;
  label: string;
  status: string;
  runtime_provider: string;
  runtime_external_id: string | null;
  os_family: string;
  expires_at: string | Date;
  run_status: string;
  run_metadata: Record<string, unknown> | null;
};

async function getOwnedNode(runId: string, nodeId: string, ownerId: string): Promise<OperationNodeRow | null> {
  const result = await getPool().query(
    `SELECT node.id,node.label,node.status,node.runtime_provider,node.runtime_external_id,node.os_family,
            run.expires_at,run.status AS run_status,run.metadata AS run_metadata
       FROM operation_nodes node
       JOIN operation_runs run ON run.id=node.run_id
      WHERE run.id=$1 AND node.id=$2 AND run.owner_id=$3
      LIMIT 1`,
    [runId, nodeId, ownerId]
  );
  return result.rows[0] || null;
}

async function validateReady(node: OperationNodeRow) {
  if (node.os_family !== 'windows') {
    return { failure: failure(409, 'DESKTOP_NOT_SUPPORTED', 'This Operation node does not provide a browser desktop. Use Terminal instead.', 'profile') };
  }
  if (node.run_metadata?.lifecycleState === 'paused') {
    return { failure: failure(409, 'OPERATION_PAUSED', 'Resume the Operation before opening a desktop.', 'operation') };
  }
  if (['destroying', 'destroyed', 'failed'].includes(node.run_status)) {
    return { failure: failure(409, 'OPERATION_NOT_ACTIVE', 'This Operation is not available for interactive access.', 'operation') };
  }
  if (new Date(node.expires_at).getTime() <= Date.now()) {
    return { failure: failure(410, 'OPERATION_EXPIRED', 'This Operation has expired and cannot open a desktop.', 'expiry') };
  }
  // Exercise bootstrap does not determine whether an owned machine can open a session.
  // The live EC2, SSM and (for desktops) service checks below remain authoritative.
  if (['failed', 'destroying', 'destroyed'].includes(node.status)) {
    return { failure: failure(409, 'OPERATION_NODE_NOT_ACTIVE', 'This machine is not available for interactive access.', 'operation') };
  }
  if (node.runtime_provider !== 'aws-ec2' || !node.runtime_external_id) {
    return { failure: failure(409, 'OPERATION_RUNTIME_MISSING', 'This Operation node does not have an AWS EC2 runtime attached.', 'database') };
  }

  let diagnostics: LabTerminalDiagnostics;
  try {
    diagnostics = await getLabTerminalDiagnostics(node.runtime_external_id);
  } catch (error) {
    return { failure: failure(503, 'DESKTOP_DIAGNOSTICS_FAILED', error instanceof Error ? error.message : 'Could not inspect the secure desktop path.', 'aws-diagnostics') };
  }
  if (diagnostics.ec2State !== 'running') {
    return { failure: failure(409, 'EC2_NOT_RUNNING', `EC2 is ${diagnostics.ec2State}; desktop access requires a running instance.`, 'ec2', diagnostics) };
  }
  if (!diagnostics.instanceProfileConfigured || !diagnostics.ssmRegistered || diagnostics.ssmPingStatus !== 'Online') {
    return { failure: failure(425, 'SSM_NOT_READY', 'The machine is running, but its secure Systems Manager session is still initializing.', 'ssm', diagnostics) };
  }

  try {
    const desktop = await ensureDesktopRuntime(node.runtime_external_id, 'windows');
    if (!desktop.ready) {
      return { failure: failure(425, 'DESKTOP_BOOTSTRAP_PENDING', 'The Windows desktop service is being prepared. OXSIG will retry automatically.', 'desktop-bootstrap', diagnostics) };
    }
    const service = await inspectDesktopService(node.runtime_external_id, 'windows');
    if (!service.ready) {
      return { failure: failure(425, 'DESKTOP_SERVICE_NOT_READY', 'The Windows desktop service is starting. OXSIG will retry automatically.', 'desktop-service', diagnostics) };
    }
  } catch (error) {
    return { failure: failure(503, 'DESKTOP_SERVICE_INSPECTION_FAILED', error instanceof Error ? error.message : 'Could not inspect the Windows desktop service.', 'desktop-service', diagnostics) };
  }
  return { externalId: node.runtime_external_id, diagnostics };
}

export async function POST(request: NextRequest, context: { params: Promise<{ id: string; nodeId: string }> }) {
  return requireAuth(request, async (req, user) => {
    if (!(await validateCsrfToken(req))) return failure(403, 'CSRF_FAILED', 'Invalid or missing CSRF token.', 'request');
    const rateLimit = await checkRateLimit(req, { maxRequests: 24, windowMs: 60_000 }, `${user.id}:operation-node-desktop`);
    if (rateLimit) return rateLimit;

    const { id, nodeId } = await context.params;
    if (!uuidSchema.safeParse(id).success || !uuidSchema.safeParse(nodeId).success) {
      return failure(400, 'INVALID_OPERATION_NODE', 'A valid Operation run and node are required.', 'request');
    }
    const node = await getOwnedNode(id, nodeId, user.id);
    if (!node) return failure(404, 'OPERATION_NODE_NOT_FOUND', 'Operation node not found.', 'database');
    const ready = await validateReady(node);
    if (ready.failure) return ready.failure;

    try {
      const session = await startDesktopPortSession(ready.externalId!, 'windows');
      const ticketTtlMs = terminalBridgeTicketTtlMs();
      const bridgeTicket = createTerminalBridgeTicket({
        streamUrl: session.streamUrl,
        region: session.region,
        sessionId: session.sessionId,
        target: ready.externalId!,
      });
      await logAudit({
        userId: user.id,
        action: AUDIT_ACTIONS.LAB_SESSION_START,
        resourceType: 'operation-node',
        resourceId: node.id,
        ...getRequestMetadata(req),
        metadata: { provider: 'aws-ssm', operationRunId: id, sessionKind: 'desktop', target: ready.externalId, sessionId: session.sessionId, port: session.port },
      });
      return json({
        sessionId: session.sessionId,
        bridgePath: `/__oxsig/terminal-bridge?ticket=${encodeURIComponent(bridgeTicket)}`,
        tokenValue: session.tokenValue,
        bridgeTicketTtlMs: ticketTtlMs,
        bridgeTicketExpiresAt: new Date(Date.now() + ticketTtlMs).toISOString(),
        region: session.region,
        target: ready.externalId,
        port: session.port,
        platform: 'windows',
        diagnostics: ready.diagnostics,
        accessEvidence: { eligible: false, reason: 'Operation desktops are runtime access surfaces rather than deployment-evidence targets.' },
      });
    } catch (error) {
      return failure(503, 'DESKTOP_SESSION_START_FAILED', error instanceof Error ? error.message : 'Could not start the private browser desktop.', 'ssm-session', ready.diagnostics);
    }
  });
}

export async function DELETE(request: NextRequest, context: { params: Promise<{ id: string; nodeId: string }> }) {
  return requireAuth(request, async (req, user) => {
    if (!(await validateCsrfToken(req))) return failure(403, 'CSRF_FAILED', 'Invalid or missing CSRF token.', 'request');
    const rateLimit = await checkRateLimit(req, { maxRequests: 30, windowMs: 60_000 }, `${user.id}:operation-node-desktop-end`);
    if (rateLimit) return rateLimit;
    const parsed = endSessionSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return failure(400, 'INVALID_SESSION_ID', 'A valid Session Manager session ID is required.', 'request');

    const { id, nodeId } = await context.params;
    if (!uuidSchema.safeParse(id).success || !uuidSchema.safeParse(nodeId).success) {
      return failure(400, 'INVALID_OPERATION_NODE', 'A valid Operation run and node are required.', 'request');
    }
    const node = await getOwnedNode(id, nodeId, user.id);
    if (!node) return failure(404, 'OPERATION_NODE_NOT_FOUND', 'Operation node not found.', 'database');
    if (!node.runtime_external_id) return failure(409, 'OPERATION_RUNTIME_MISSING', 'This Operation node has no EC2 runtime.', 'database');

    try {
      const result = await terminateInteractiveLabSession(node.runtime_external_id, parsed.data.sessionId);
      await logAudit({
        userId: user.id,
        action: AUDIT_ACTIONS.LAB_SESSION_END,
        resourceType: 'operation-node',
        resourceId: node.id,
        ...getRequestMetadata(req),
        metadata: { provider: 'aws-ssm', operationRunId: id, sessionKind: 'desktop', target: node.runtime_external_id, sessionId: parsed.data.sessionId },
      });
      return json(result);
    } catch (error) {
      return failure(503, 'DESKTOP_SESSION_END_FAILED', error instanceof Error ? error.message : 'Could not terminate the browser desktop session.', 'ssm-session');
    }
  });
}

