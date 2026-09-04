import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAuth } from '@/lib/auth/middleware';
import { validateCsrfToken } from '@/lib/security/csrf';
import { checkRateLimit } from '@/lib/security/rate-limit';
import { getPool } from '@/lib/db/pool';
import { startInteractiveLabSession, terminateInteractiveLabSession } from '@/lib/labs/aws-runtime';
import { issueSsmBridgeTicket } from '@/lib/labs/ssm-bridge-ticket';
import { getLabTerminalDiagnostics, type LabTerminalDiagnostics } from '@/lib/labs/terminal-observability';
import { AUDIT_ACTIONS, getRequestMetadata, logAudit } from '@/lib/audit/logger';

export const runtime = 'nodejs';

const endSessionSchema = z.object({
  sessionId: z.string().min(1).max(128).regex(/^[A-Za-z0-9_.:@-]+$/),
}).strict();

type LabRow = {
  id: string;
  status: string;
  runtime_provider: string;
  runtime_external_id: string | null;
  expires_at: string | Date | null;
  last_error: string | null;
};

const PRIVATE_HEADERS = {
  'Cache-Control': 'private, no-store, max-age=0',
  Pragma: 'no-cache',
};

function json(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: PRIVATE_HEADERS });
}

async function getOwnedLab(id: string, ownerId: string): Promise<LabRow | null> {
  const result = await getPool().query(
    `SELECT id,status,runtime_provider,runtime_external_id,expires_at,last_error
     FROM lab_instances
     WHERE id=$1 AND owner_id=$2
     LIMIT 1`,
    [id, ownerId]
  );
  return result.rows[0] || null;
}

async function reconcileObservedState(instance: LabRow, diagnostics: LabTerminalDiagnostics) {
  if (instance.status === diagnostics.ec2State) return;
  const observedStatus = diagnostics.ec2State;
  const isDestroyed = observedStatus === 'destroyed';
  const isRunning = observedStatus === 'running';
  const isStopped = observedStatus === 'stopped';

  await getPool().query(
    `UPDATE lab_instances
     SET status=$1::varchar,
         last_error=CASE WHEN $2::boolean THEN NULL ELSE last_error END,
         started_at=CASE WHEN $3::boolean AND started_at IS NULL THEN NOW() ELSE started_at END,
         stopped_at=CASE WHEN $4::boolean THEN NOW() ELSE stopped_at END,
         updated_at=NOW()
     WHERE id=$5`,
    [observedStatus, isDestroyed, isRunning, isStopped, instance.id]
  );
  instance.status = observedStatus;
  if (isDestroyed) instance.last_error = null;
}

function failure(status: number, code: string, error: string, stage: string, diagnostics?: LabTerminalDiagnostics) {
  return json({ error, code, stage, diagnostics }, status);
}

async function validateInteractiveReady(instance: LabRow) {
  if (instance.runtime_provider !== 'aws-ec2' || !instance.runtime_external_id) {
    return { failure: failure(409, 'LAB_RUNTIME_MISSING', 'The lab record does not have an AWS EC2 runtime attached.', 'database') };
  }

  let diagnostics: LabTerminalDiagnostics;
  try {
    diagnostics = await getLabTerminalDiagnostics(instance.runtime_external_id);
    await reconcileObservedState(instance, diagnostics);
  } catch (error) {
    return {
      failure: failure(
        503,
        'TERMINAL_DIAGNOSTICS_FAILED',
        error instanceof Error ? error.message : 'Could not inspect the lab terminal path.',
        'aws-diagnostics'
      ),
    };
  }

  if (instance.expires_at && new Date(instance.expires_at).getTime() <= Date.now()) {
    return { failure: failure(410, 'LAB_EXPIRED', 'The lab session has expired and cannot open a terminal.', 'expiry', diagnostics) };
  }
  if (diagnostics.ec2State === 'destroyed' || diagnostics.ec2State === 'destroying') {
    return { failure: failure(410, 'EC2_TERMINATED', 'The EC2 instance no longer exists as a usable lab.', 'ec2', diagnostics) };
  }
  if (diagnostics.ec2State !== 'running') {
    return { failure: failure(409, 'EC2_NOT_RUNNING', `EC2 is ${diagnostics.ec2State}; an interactive terminal requires a running instance.`, 'ec2', diagnostics) };
  }
  if (!diagnostics.instanceProfileConfigured) {
    return { failure: failure(503, 'SSM_PROFILE_MISSING', 'LAB_AWS_INSTANCE_PROFILE is not configured for terminal access.', 'ssm', diagnostics) };
  }
  if (!diagnostics.ssmRegistered) {
    return { failure: failure(503, 'SSM_NOT_REGISTERED', 'EC2 is running, but Systems Manager has not registered this instance yet.', 'ssm', diagnostics) };
  }
  if (diagnostics.ssmPingStatus !== 'Online') {
    return { failure: failure(503, 'SSM_OFFLINE', `Systems Manager reports ${diagnostics.ssmPingStatus || 'unknown'} instead of Online.`, 'ssm', diagnostics) };
  }

  return { diagnostics, externalId: instance.runtime_external_id };
}

export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  return requireAuth(request, async (req, user) => {
    if (!(await validateCsrfToken(req))) {
      return failure(403, 'CSRF_FAILED', 'Invalid or missing CSRF token.', 'request');
    }

    const rateLimit = await checkRateLimit(req, { maxRequests: 10, windowMs: 60_000 }, user.id);
    if (rateLimit) return rateLimit;

    const { id } = await context.params;
    const instance = await getOwnedLab(id, user.id);
    if (!instance) return failure(404, 'LAB_NOT_FOUND', 'No Oxsig lab record exists for this account and lab ID.', 'database');

    const ready = await validateInteractiveReady(instance);
    if (ready.failure) return ready.failure;

    try {
      const session = await startInteractiveLabSession(ready.externalId!);
      const bridgeUrl = issueSsmBridgeTicket({
        streamUrl: session.streamUrl,
        tokenValue: session.tokenValue,
        region: session.region,
        sessionId: session.sessionId,
        ownerId: user.id,
      });

      await logAudit({
        userId: user.id,
        action: AUDIT_ACTIONS.LAB_SESSION_START,
        resourceType: 'lab',
        resourceId: id,
        ...getRequestMetadata(req),
        metadata: {
          provider: 'aws-ssm',
          sessionId: session.sessionId,
          target: ready.externalId,
          region: session.region,
          websocketAuth: 'server-sigv4-header-bridge',
        },
      });

      // The AWS StreamUrl, TokenValue and AWS credentials remain server-side.
      // `tokenValue` below is only a compatibility marker for the existing
      // browser protocol; the bridge consumes that first client message and
      // sends AWS the real server-held TokenValue instead.
      return json({
        sessionId: session.sessionId,
        streamUrl: bridgeUrl,
        tokenValue: 'server-bridge',
        region: session.region,
        target: ready.externalId,
        diagnostics: ready.diagnostics,
      });
    } catch (error) {
      return failure(
        503,
        'SSM_SESSION_START_FAILED',
        error instanceof Error ? error.message : 'Could not start the interactive Session Manager shell.',
        'ssm-session',
        ready.diagnostics
      );
    }
  });
}

export async function DELETE(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  return requireAuth(request, async (req, user) => {
    if (!(await validateCsrfToken(req))) {
      return failure(403, 'CSRF_FAILED', 'Invalid or missing CSRF token.', 'request');
    }

    const rateLimit = await checkRateLimit(req, { maxRequests: 30, windowMs: 60_000 }, user.id);
    if (rateLimit) return rateLimit;

    const parsed = endSessionSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return failure(400, 'INVALID_SESSION_ID', 'A valid Session Manager session ID is required.', 'request');

    const { id } = await context.params;
    const instance = await getOwnedLab(id, user.id);
    if (!instance) return failure(404, 'LAB_NOT_FOUND', 'No Oxsig lab record exists for this account and lab ID.', 'database');
    if (instance.runtime_provider !== 'aws-ec2' || !instance.runtime_external_id) {
      return failure(409, 'LAB_RUNTIME_MISSING', 'The lab record does not have an AWS EC2 runtime attached.', 'database');
    }

    try {
      const result = await terminateInteractiveLabSession(instance.runtime_external_id, parsed.data.sessionId);
      await logAudit({
        userId: user.id,
        action: AUDIT_ACTIONS.LAB_SESSION_END,
        resourceType: 'lab',
        resourceId: id,
        ...getRequestMetadata(req),
        metadata: {
          provider: 'aws-ssm',
          sessionId: parsed.data.sessionId,
          target: instance.runtime_external_id,
          terminated: result.terminated,
          alreadyEnded: result.alreadyEnded,
        },
      });
      return json(result);
    } catch (error) {
      return failure(
        503,
        'SSM_SESSION_END_FAILED',
        error instanceof Error ? error.message : 'Could not terminate the interactive Session Manager shell.',
        'ssm-session'
      );
    }
  });
}
