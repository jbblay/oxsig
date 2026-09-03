import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAuth } from '@/lib/auth/middleware';
import { validateCsrfToken } from '@/lib/security/csrf';
import { checkRateLimit } from '@/lib/security/rate-limit';
import { getPool } from '@/lib/db/pool';
import {
  executeObservedLabCommand,
  getLabTerminalDiagnostics,
  type LabTerminalDiagnostics,
} from '@/lib/labs/terminal-observability';
import { AUDIT_ACTIONS, getRequestMetadata, logAudit } from '@/lib/audit/logger';

export const runtime = 'nodejs';
const commandSchema = z.object({ command: z.string().trim().min(1).max(1000) }).strict();

type LabRow = {
  id: string;
  status: string;
  runtime_provider: string;
  runtime_external_id: string | null;
  expires_at: string | Date | null;
  last_error: string | null;
};

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

function labSnapshot(instance: LabRow) {
  return {
    id: instance.id,
    status: instance.status,
    externalId: instance.runtime_external_id,
    expiresAt: instance.expires_at,
    lastError: instance.last_error,
  };
}

function failure(
  status: number,
  code: string,
  error: string,
  stage: string,
  instance?: LabRow,
  diagnostics?: LabTerminalDiagnostics
) {
  return NextResponse.json(
    {
      error,
      code,
      stage,
      lab: instance ? labSnapshot(instance) : undefined,
      diagnostics,
    },
    { status }
  );
}

export async function GET(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  return requireAuth(request, async (_req, user) => {
    const { id } = await context.params;
    const instance = await getOwnedLab(id, user.id);
    if (!instance) {
      return failure(404, 'LAB_NOT_FOUND', 'No Oxsig lab record exists for this account and lab ID.', 'database');
    }
    if (instance.runtime_provider !== 'aws-ec2' || !instance.runtime_external_id) {
      return failure(409, 'LAB_RUNTIME_MISSING', 'The lab record does not have an AWS EC2 runtime attached.', 'database', instance);
    }

    try {
      const diagnostics = await getLabTerminalDiagnostics(instance.runtime_external_id);
      await reconcileObservedState(instance, diagnostics);
      return NextResponse.json({ lab: labSnapshot(instance), diagnostics });
    } catch (error) {
      return failure(
        503,
        'TERMINAL_DIAGNOSTICS_FAILED',
        error instanceof Error ? error.message : 'Could not inspect the lab terminal path.',
        'aws-diagnostics',
        instance
      );
    }
  });
}

export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  return requireAuth(request, async (req, user) => {
    if (!(await validateCsrfToken(req))) {
      return failure(403, 'CSRF_FAILED', 'Invalid or missing CSRF token.', 'request');
    }

    const rateLimit = await checkRateLimit(
      req,
      { maxRequests: 60, windowMs: 60_000 },
      user.id
    );
    if (rateLimit) return rateLimit;

    const parsed = commandSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return failure(400, 'INVALID_COMMAND', 'Command must contain 1 to 1000 characters.', 'request');
    }

    const { id } = await context.params;
    const instance = await getOwnedLab(id, user.id);
    if (!instance) {
      return failure(404, 'LAB_NOT_FOUND', 'No Oxsig lab record exists for this account and lab ID.', 'database');
    }
    if (instance.runtime_provider !== 'aws-ec2' || !instance.runtime_external_id) {
      return failure(409, 'LAB_RUNTIME_MISSING', 'The lab record does not have an AWS EC2 runtime attached.', 'database', instance);
    }

    let diagnostics: LabTerminalDiagnostics;
    try {
      diagnostics = await getLabTerminalDiagnostics(instance.runtime_external_id);
      await reconcileObservedState(instance, diagnostics);
    } catch (error) {
      return failure(
        503,
        'TERMINAL_DIAGNOSTICS_FAILED',
        error instanceof Error ? error.message : 'Could not inspect the lab terminal path.',
        'aws-diagnostics',
        instance
      );
    }

    if (instance.expires_at && new Date(instance.expires_at).getTime() <= Date.now()) {
      return failure(410, 'LAB_EXPIRED', 'The lab session has expired and cannot accept commands.', 'expiry', instance, diagnostics);
    }
    if (diagnostics.ec2State === 'destroyed' || diagnostics.ec2State === 'destroying') {
      return failure(410, 'EC2_TERMINATED', 'The EC2 instance no longer exists as a usable lab.', 'ec2', instance, diagnostics);
    }
    if (diagnostics.ec2State !== 'running') {
      return failure(409, 'EC2_NOT_RUNNING', `EC2 is ${diagnostics.ec2State}; commands require a running instance.`, 'ec2', instance, diagnostics);
    }
    if (!diagnostics.instanceProfileConfigured) {
      return failure(503, 'SSM_PROFILE_MISSING', 'LAB_AWS_INSTANCE_PROFILE is not configured for terminal access.', 'ssm', instance, diagnostics);
    }
    if (!diagnostics.ssmRegistered) {
      return failure(503, 'SSM_NOT_REGISTERED', 'EC2 is running, but Systems Manager has not registered this instance yet.', 'ssm', instance, diagnostics);
    }
    if (diagnostics.ssmPingStatus !== 'Online') {
      return failure(503, 'SSM_OFFLINE', `Systems Manager reports ${diagnostics.ssmPingStatus || 'unknown'} instead of Online.`, 'ssm', instance, diagnostics);
    }

    try {
      const output = await executeObservedLabCommand(
        instance.runtime_external_id,
        parsed.data.command,
        diagnostics.platformType
      );
      await logAudit({
        userId: user.id,
        action: AUDIT_ACTIONS.LAB_COMMAND,
        resourceType: 'lab',
        resourceId: id,
        ...getRequestMetadata(req),
        metadata: {
          length: parsed.data.command.length,
          provider: 'aws-ssm',
          platformType: diagnostics.platformType,
          documentName: output.documentName,
          commandId: output.commandId,
          exitCode: output.exitCode,
          durationMs: output.durationMs,
        },
      });
      return NextResponse.json({ ...output, lab: labSnapshot(instance), diagnostics });
    } catch (error) {
      return failure(
        503,
        'SSM_COMMAND_FAILED',
        error instanceof Error ? error.message : 'SSM command execution failed.',
        'command',
        instance,
        diagnostics
      );
    }
  });
}
