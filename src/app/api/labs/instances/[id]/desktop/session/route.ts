import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAuth } from '@/lib/auth/middleware';
import { validateCsrfToken } from '@/lib/security/csrf';
import { checkRateLimit } from '@/lib/security/rate-limit';
import { getPool } from '@/lib/db/pool';
import { getGuestServiceReadinessEvidence } from '@/lib/execution-evidence/guest-service-readiness';
import { getDeploymentAuthorizationById } from '@/lib/infrastructure/deployment-authorization';
import { guestServiceReadinessPayloadSchema } from '@/lib/infrastructure/guest-service-readiness-evidence';
import { ensureDesktopRuntime, inspectDesktopService, startDesktopPortSession, type DesktopPlatform } from '@/lib/labs/desktop-runtime';
import { terminateInteractiveLabSession } from '@/lib/labs/aws-runtime';
import { createDesktopAccessEvidenceTicket } from '@/lib/labs/desktop-access-evidence-ticket';
import { createTerminalBridgeTicket, terminalBridgeTicketTtlMs } from '@/lib/labs/terminal-bridge-ticket.js';
import { getLabTerminalDiagnostics, type LabTerminalDiagnostics } from '@/lib/labs/terminal-observability';
import { AUDIT_ACTIONS, getRequestMetadata, logAudit } from '@/lib/audit/logger';

export const runtime = 'nodejs';

const endSessionSchema = z.object({
  sessionId: z.string().min(1).max(128).regex(/^[A-Za-z0-9_.:@-]+$/),
}).strict();

const PRIVATE_HEADERS = {
  'Cache-Control': 'private, no-store, max-age=0',
  Pragma: 'no-cache',
};

type LabRow = {
  id: string;
  status: string;
  runtime_provider: string;
  runtime_external_id: string | null;
  expires_at: string | Date | null;
  metadata: Record<string, unknown> | null;
};

function json(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: PRIVATE_HEADERS });
}

function failure(status: number, code: string, error: string, stage: string, diagnostics?: LabTerminalDiagnostics) {
  return json({ error, code, stage, diagnostics }, status);
}

async function getOwnedLab(id: string, ownerId: string): Promise<LabRow | null> {
  const result = await getPool().query(
    `SELECT id,status,runtime_provider,runtime_external_id,expires_at,metadata
     FROM lab_instances
     WHERE id=$1 AND owner_id=$2
     LIMIT 1`,
    [id, ownerId]
  );
  return result.rows[0] || null;
}

async function reconcileObservedState(instance: LabRow, diagnostics: LabTerminalDiagnostics) {
  if (instance.status === diagnostics.ec2State) return;
  await getPool().query(
    `UPDATE lab_instances
     SET status=$1::varchar,
         started_at=CASE WHEN $2::boolean AND started_at IS NULL THEN NOW() ELSE started_at END,
         stopped_at=CASE WHEN $3::boolean THEN NOW() ELSE stopped_at END,
         updated_at=NOW()
     WHERE id=$4`,
    [diagnostics.ec2State, diagnostics.ec2State === 'running', diagnostics.ec2State === 'stopped', instance.id]
  );
  instance.status = diagnostics.ec2State;
}

async function validateDesktopReady(instance: LabRow) {
  if (instance.metadata?.accessMode !== 'desktop') {
    return { failure: failure(409, 'DESKTOP_NOT_PROVISIONED', 'This lab was provisioned for terminal access, not desktop access.', 'profile') };
  }
  if (instance.runtime_provider !== 'aws-ec2' || !instance.runtime_external_id) {
    return { failure: failure(409, 'LAB_RUNTIME_MISSING', 'The lab record does not have an AWS EC2 runtime attached.', 'database') };
  }

  let diagnostics: LabTerminalDiagnostics;
  try {
    diagnostics = await getLabTerminalDiagnostics(instance.runtime_external_id);
    await reconcileObservedState(instance, diagnostics);
  } catch (error) {
    return { failure: failure(503, 'DESKTOP_DIAGNOSTICS_FAILED', error instanceof Error ? error.message : 'Could not inspect the desktop path.', 'aws-diagnostics') };
  }

  if (instance.expires_at && new Date(instance.expires_at).getTime() <= Date.now()) {
    return { failure: failure(410, 'LAB_EXPIRED', 'The lab session has expired and cannot open a desktop.', 'expiry', diagnostics) };
  }
  if (diagnostics.ec2State !== 'running') {
    return { failure: failure(409, 'EC2_NOT_RUNNING', `EC2 is ${diagnostics.ec2State}; desktop access requires a running instance.`, 'ec2', diagnostics) };
  }
  if (!diagnostics.instanceProfileConfigured || !diagnostics.ssmRegistered || diagnostics.ssmPingStatus !== 'Online') {
    return { failure: failure(503, 'SSM_NOT_READY', 'Systems Manager must be Online before the private desktop tunnel can start.', 'ssm', diagnostics) };
  }

  const platform: DesktopPlatform = instance.metadata?.platform === 'windows' ? 'windows' : 'linux';
  const runtime = await ensureDesktopRuntime(instance.runtime_external_id, platform);
  if (!runtime.ready) {
    return {
      failure: failure(
        425,
        'DESKTOP_BOOTSTRAP_PENDING',
        'The private desktop service is being prepared on this lab. Oxsig will retry automatically.',
        'desktop-bootstrap',
        diagnostics
      ),
    };
  }

  try {
    const service = await inspectDesktopService(instance.runtime_external_id, platform);
    if (!service.ready) {
      return {
        failure: failure(
          425,
          'DESKTOP_SERVICE_NOT_READY',
          'The desktop service has not yet reached the expected loopback-only listening state. Oxsig will retry automatically.',
          'desktop-service',
          diagnostics
        ),
      };
    }
  } catch (error) {
    return {
      failure: failure(
        503,
        'DESKTOP_SERVICE_INSPECTION_FAILED',
        error instanceof Error ? error.message : 'Could not inspect the desktop guest service.',
        'desktop-service',
        diagnostics
      ),
    };
  }

  return { externalId: instance.runtime_external_id, platform, diagnostics };
}

type DesktopSessionResult = Awaited<ReturnType<typeof startDesktopPortSession>>;

async function buildAccessEvidenceOffer(input: {
  ownerId: string;
  labInstanceId: string;
  runtimeExternalId: string;
  platform: DesktopPlatform;
  session: DesktopSessionResult;
}) {
  try {
    const guestEvidence = await getGuestServiceReadinessEvidence({
      ownerId: input.ownerId,
      labInstanceId: input.labInstanceId,
    });
    const guest = guestServiceReadinessPayloadSchema.parse(guestEvidence.payload);
    if (!guest.readiness.guestServiceReady || guest.readiness.state !== 'ready') {
      return { eligible: false as const, reason: 'Capture a ready guest-service evidence record before recording end-to-end access evidence.' };
    }

    const authorization = await getDeploymentAuthorizationById(input.ownerId, guestEvidence.deploymentAuthorizationId);
    const target = authorization?.executionSupport.target;
    if (
      !authorization ||
      !['evidence_recorded', 'analyzed'].includes(authorization.state) ||
      !authorization.executionId ||
      authorization.labInstanceId !== input.labInstanceId ||
      authorization.planId !== guest.planId ||
      authorization.planHash !== guest.planHash ||
      authorization.executionId !== guest.deploymentExecutionId ||
      !target ||
      target.accessMode !== 'desktop' ||
      target.nodeId !== guest.target.nodeId ||
      target.labSlug !== guest.target.labSlug
    ) {
      return { eligible: false as const, reason: 'The latest guest-service evidence does not match the active controlled desktop deployment.' };
    }

    const issued = createDesktopAccessEvidenceTicket({
      ownerId: input.ownerId,
      labInstanceId: input.labInstanceId,
      deploymentAuthorizationId: authorization.id,
      deploymentExecutionId: authorization.executionId,
      planId: authorization.planId,
      planHash: authorization.planHash,
      prerequisiteGuestEvidenceId: guestEvidence.id,
      sessionId: input.session.sessionId,
      target: input.runtimeExternalId,
      platform: input.platform,
      port: input.session.port,
    });

    return {
      eligible: true as const,
      ticket: issued.ticket,
      evidenceExecutionId: issued.evidenceExecutionId,
      expiresAt: issued.expiresAt,
      ttlMs: issued.ttlMs,
      prerequisiteGuestEvidenceId: guestEvidence.id,
    };
  } catch {
    return {
      eligible: false as const,
      reason: 'Capture guest-service readiness evidence first to enable browser access-path evidence.',
    };
  }
}

export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  return requireAuth(request, async (req, user) => {
    if (!(await validateCsrfToken(req))) return failure(403, 'CSRF_FAILED', 'Invalid or missing CSRF token.', 'request');
    const rateLimit = await checkRateLimit(req, { maxRequests: 24, windowMs: 60_000 }, user.id);
    if (rateLimit) return rateLimit;

    const { id } = await context.params;
    const instance = await getOwnedLab(id, user.id);
    if (!instance) return failure(404, 'LAB_NOT_FOUND', 'No Oxsig lab record exists for this account and lab ID.', 'database');

    const ready = await validateDesktopReady(instance);
    if (ready.failure) return ready.failure;

    try {
      const session = await startDesktopPortSession(ready.externalId!, ready.platform!);
      const ticketTtlMs = terminalBridgeTicketTtlMs();
      const bridgeTicket = createTerminalBridgeTicket({
        streamUrl: session.streamUrl,
        region: session.region,
        sessionId: session.sessionId,
        target: ready.externalId!,
      });
      const accessEvidence = await buildAccessEvidenceOffer({
        ownerId: user.id,
        labInstanceId: id,
        runtimeExternalId: ready.externalId!,
        platform: ready.platform!,
        session,
      });

      await logAudit({
        userId: user.id,
        action: AUDIT_ACTIONS.LAB_SESSION_START,
        resourceType: 'lab',
        resourceId: id,
        ...getRequestMetadata(req),
        metadata: {
          provider: 'aws-ssm',
          sessionKind: 'desktop',
          sessionId: session.sessionId,
          target: ready.externalId,
          region: session.region,
          port: session.port,
          websocketAuth: 'server-bridge-sigv4-header',
          accessEvidenceEligible: accessEvidence.eligible,
          ...(accessEvidence.eligible ? { prerequisiteGuestEvidenceId: accessEvidence.prerequisiteGuestEvidenceId } : {}),
        },
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
        platform: ready.platform,
        diagnostics: ready.diagnostics,
        accessEvidence,
      });
    } catch (error) {
      return failure(503, 'DESKTOP_SESSION_START_FAILED', error instanceof Error ? error.message : 'Could not start the private browser desktop.', 'ssm-session', ready.diagnostics);
    }
  });
}

export async function DELETE(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  return requireAuth(request, async (req, user) => {
    if (!(await validateCsrfToken(req))) return failure(403, 'CSRF_FAILED', 'Invalid or missing CSRF token.', 'request');
    const rateLimit = await checkRateLimit(req, { maxRequests: 30, windowMs: 60_000 }, user.id);
    if (rateLimit) return rateLimit;

    const parsed = endSessionSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return failure(400, 'INVALID_SESSION_ID', 'A valid Session Manager session ID is required.', 'request');

    const { id } = await context.params;
    const instance = await getOwnedLab(id, user.id);
    if (!instance) return failure(404, 'LAB_NOT_FOUND', 'No Oxsig lab record exists for this account and lab ID.', 'database');
    if (!instance.runtime_external_id) return failure(409, 'LAB_RUNTIME_MISSING', 'The lab record does not have an AWS EC2 runtime attached.', 'database');

    try {
      const result = await terminateInteractiveLabSession(instance.runtime_external_id, parsed.data.sessionId);
      await logAudit({
        userId: user.id,
        action: AUDIT_ACTIONS.LAB_SESSION_END,
        resourceType: 'lab',
        resourceId: id,
        ...getRequestMetadata(req),
        metadata: { provider: 'aws-ssm', sessionKind: 'desktop', sessionId: parsed.data.sessionId, target: instance.runtime_external_id },
      });
      return json(result);
    } catch (error) {
      return failure(503, 'DESKTOP_SESSION_END_FAILED', error instanceof Error ? error.message : 'Could not terminate the browser desktop session.', 'ssm-session');
    }
  });
}
