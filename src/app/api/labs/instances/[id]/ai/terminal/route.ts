import { stringifyPostgresJson } from '@/lib/db/postgres-safe';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAuth } from '@/lib/auth/middleware';
import { getPool } from '@/lib/db/pool';
import { validateCsrfToken } from '@/lib/security/csrf';
import { checkRateLimit } from '@/lib/security/rate-limit';
import { LAB_CATALOG } from '@/lib/labs/catalog';
import {
  truncatePractitionerEvidence,
  validatePractitionerCommand,
} from '@/lib/ai-practitioner/server';
import {
  authorizeTerminalEvidence,
  ExecutionEvidenceConflictError,
} from '@/lib/execution-evidence/server';
import {
  beginBoundTerminalExecution,
  recordBoundTerminalEvidence,
} from '@/lib/execution-evidence/terminal-execution-receipt';
import {
  TerminalExecutionSessionError,
  verifyActiveTerminalExecutionSession,
} from '@/lib/labs/terminal-execution-session';

export const runtime = 'nodejs';

const terminalSurfaceSchema = z.enum(['ai-practitioner', 'academy']);
const sessionIdSchema = z.string().min(1).max(128).regex(/^[A-Za-z0-9_.:@-]+$/);

const terminalExecutionSchema = z.discriminatedUnion('action', [
  z.object({
    action: z.literal('authorize'),
    surface: terminalSurfaceSchema,
    command: z.string().trim().min(1).max(1000),
    approved: z.literal(true),
  }).strict(),
  z.object({
    action: z.literal('begin'),
    surface: terminalSurfaceSchema,
    executionId: z.string().uuid(),
    command: z.string().trim().min(1).max(1000),
    sessionId: sessionIdSchema,
  }).strict(),
  z.object({
    action: z.literal('record'),
    surface: terminalSurfaceSchema,
    executionId: z.string().uuid(),
    executionReceiptId: z.string().uuid(),
    sessionId: sessionIdSchema,
    command: z.string().trim().min(1).max(1000),
    stdout: z.string().max(25000).default(''),
    stderr: z.string().max(25000).default(''),
    exitCode: z.number().int().min(-1).max(255),
  }).strict(),
]);

async function resolveOwnedRunningLab(ownerId: string, labInstanceId: string) {
  const result = await getPool().query(
    `SELECT instance.id, instance.status, instance.expires_at, instance.runtime_provider, instance.runtime_external_id,
            definition.slug
     FROM lab_instances instance
     JOIN lab_definitions definition ON definition.id = instance.definition_id
     WHERE instance.id = $1 AND instance.owner_id = $2 AND instance.status <> 'destroyed'
     LIMIT 1`,
    [labInstanceId, ownerId]
  );

  const instance = result.rows[0];
  if (!instance) return { error: 'Lab instance not found', status: 404 as const };
  if (instance.expires_at && new Date(instance.expires_at).getTime() <= Date.now()) {
    return { error: 'The Cyber Lab session has expired', status: 410 as const };
  }
  if (instance.status !== 'running') {
    return { error: 'The Cyber Lab machine must be running before AI can execute a command', status: 409 as const };
  }
  if (instance.runtime_provider !== 'aws-ec2' || !instance.runtime_external_id) {
    return { error: 'This lab does not support managed terminal execution', status: 409 as const };
  }

  const lab = LAB_CATALOG.find((item) => item.slug === instance.slug);
  if (!lab) return { error: 'Lab definition is unavailable', status: 409 as const };
  if (lab.platform !== 'linux') {
    return { error: 'Visible AI terminal execution is currently available for Linux labs', status: 409 as const };
  }

  return { instance, lab };
}

export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  return requireAuth(request, async (req, user) => {
    if (!(await validateCsrfToken(req))) {
      return NextResponse.json({ error: 'Invalid or missing CSRF token' }, { status: 403 });
    }

    const rateLimit = await checkRateLimit(req, { maxRequests: 24, windowMs: 60_000 }, user.id);
    if (rateLimit) return rateLimit;

    const parsed = terminalExecutionSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid interactive AI terminal request' }, { status: 400 });
    }

    const validation = validatePractitionerCommand(parsed.data.command);
    if (!validation.ok) return NextResponse.json({ error: validation.error }, { status: 400 });

    const { id } = await context.params;
    const resolved = await resolveOwnedRunningLab(user.id, id);
    if ('error' in resolved) return NextResponse.json({ error: resolved.error }, { status: resolved.status });
    const { instance, lab } = resolved;

    try {
      if (parsed.data.action === 'authorize') {
        const evidence = await authorizeTerminalEvidence({
          ownerId: user.id,
          labInstanceId: instance.id,
          command: parsed.data.command,
          surface: parsed.data.surface,
          metadata: {
            risk: validation.risk,
            platform: lab.platform,
            shell: lab.shell,
            executionMode: 'interactive-terminal',
            surface: parsed.data.surface,
          },
        });

        if (parsed.data.surface === 'ai-practitioner') {
          await getPool().query(
            `INSERT INTO ai_practitioner_events (
               owner_id, lab_instance_id, event_type, command, metadata
             ) VALUES ($1,$2,'execution-approved',$3,$4::jsonb)`,
            [
              user.id,
              instance.id,
              parsed.data.command,
              stringifyPostgresJson({
                risk: validation.risk,
                platform: lab.platform,
                shell: lab.shell,
                executionMode: 'interactive-terminal',
                executionId: evidence.executionId,
                evidenceId: evidence.id,
                provenance: evidence.provenance,
                surface: parsed.data.surface,
              }),
            ]
          );
        }

        return NextResponse.json({
          authorization: {
            command: parsed.data.command,
            risk: validation.risk,
            labInstanceId: instance.id,
            executionId: evidence.executionId,
            evidenceId: evidence.id,
            expiresAt: evidence.expiresAt,
            provenance: evidence.provenance,
            surface: parsed.data.surface,
          },
        });
      }

      if (parsed.data.action === 'begin') {
        let activeSession;
        try {
          activeSession = await verifyActiveTerminalExecutionSession(
            instance.runtime_external_id,
            parsed.data.sessionId
          );
        } catch (error) {
          if (error instanceof TerminalExecutionSessionError) {
            return NextResponse.json(
              { error: error.message, code: error.code },
              { status: 409, headers: { 'Cache-Control': 'no-store' } }
            );
          }
          return NextResponse.json(
            { error: 'Oxsig could not verify the active terminal session.', code: 'TERMINAL_SESSION_VERIFY_FAILED' },
            { status: 503, headers: { 'Cache-Control': 'no-store' } }
          );
        }

        const receipt = await beginBoundTerminalExecution({
          ownerId: user.id,
          labInstanceId: instance.id,
          executionId: parsed.data.executionId,
          surface: parsed.data.surface,
          command: parsed.data.command,
          terminalSessionId: activeSession.sessionId,
          target: activeSession.target,
        });

        return NextResponse.json({
          receipt: {
            executionId: receipt.executionId,
            evidenceId: receipt.id,
            executionReceiptId: receipt.executionReceiptId,
            sessionId: receipt.terminalSessionId,
            expiresAt: receipt.expiresAt,
            provenance: receipt.provenance,
            surface: receipt.surface,
          },
        }, { headers: { 'Cache-Control': 'no-store' } });
      }

      const stdout = truncatePractitionerEvidence(parsed.data.stdout);
      const stderr = truncatePractitionerEvidence(parsed.data.stderr);
      const evidence = await recordBoundTerminalEvidence({
        ownerId: user.id,
        labInstanceId: instance.id,
        executionId: parsed.data.executionId,
        executionReceiptId: parsed.data.executionReceiptId,
        terminalSessionId: parsed.data.sessionId,
        surface: parsed.data.surface,
        command: parsed.data.command,
        stdout,
        stderr,
        exitCode: parsed.data.exitCode,
      });

      if (parsed.data.surface === 'ai-practitioner') {
        await getPool().query(
          `INSERT INTO ai_practitioner_events (
             owner_id, lab_instance_id, event_type, command, stdout, stderr, exit_code, metadata
           ) VALUES ($1,$2,'execution',$3,$4,$5,$6,$7::jsonb)`,
          [
            user.id,
            instance.id,
            evidence.command,
            evidence.stdout,
            evidence.stderr,
            evidence.exitCode,
            stringifyPostgresJson({
              risk: validation.risk,
              platform: lab.platform,
              shell: lab.shell,
              executionMode: 'interactive-terminal',
              executionId: evidence.executionId,
              evidenceId: evidence.id,
              provenance: evidence.provenance,
              executionReceiptId: evidence.executionReceiptId,
              terminalSessionId: evidence.terminalSessionId,
              receiptBinding: 'exact-session-bound',
              surface: parsed.data.surface,
            }),
          ]
        );
      }

      return NextResponse.json({
        execution: {
          command: evidence.command,
          stdout: evidence.stdout,
          stderr: evidence.stderr,
          exitCode: evidence.exitCode ?? -1,
          risk: validation.risk,
          executionId: evidence.executionId,
          evidenceId: evidence.id,
          provenance: evidence.provenance,
          executionReceiptId: evidence.executionReceiptId,
          terminalSessionId: evidence.terminalSessionId,
          surface: evidence.surface,
        },
      }, { headers: { 'Cache-Control': 'no-store' } });
    } catch (error) {
      if (error instanceof ExecutionEvidenceConflictError) {
        return NextResponse.json(
          { error: error.message, code: error.code },
          { status: 409, headers: { 'Cache-Control': 'no-store' } }
        );
      }
      throw error;
    }
  });
}
