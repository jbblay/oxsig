import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAuth } from '@/lib/auth/middleware';
import { getPool } from '@/lib/db/pool';
import { sanitizePostgresText, stringifyPostgresJson } from '@/lib/db/postgres-safe';
import { validateCsrfToken } from '@/lib/security/csrf';
import { checkRateLimit } from '@/lib/security/rate-limit';
import { truncatePractitionerEvidence, validatePractitionerCommand } from '@/lib/ai-practitioner/server';
import {
  authorizeOperationTerminalEvidence,
  beginBoundOperationTerminalExecution,
  recordBoundOperationTerminalEvidence,
} from '@/lib/execution-evidence/operation-terminal';
import { ExecutionEvidenceConflictError } from '@/lib/execution-evidence/server';
import {
  TerminalExecutionSessionError,
  verifyActiveTerminalExecutionSession,
} from '@/lib/labs/terminal-execution-session';

export const runtime = 'nodejs';

const uuidSchema = z.string().uuid();
const sessionIdSchema = z.string().min(1).max(128).regex(/^[A-Za-z0-9_.:@-]+$/);
const schema = z.discriminatedUnion('action', [
  z.object({
    action: z.literal('authorize'),
    surface: z.literal('ai-practitioner'),
    command: z.string().trim().min(1).max(1000),
    approved: z.literal(true),
  }).strict(),
  z.object({
    action: z.literal('begin'),
    surface: z.literal('ai-practitioner'),
    executionId: z.string().uuid(),
    command: z.string().trim().min(1).max(1000),
    sessionId: sessionIdSchema,
  }).strict(),
  z.object({
    action: z.literal('record'),
    surface: z.literal('ai-practitioner'),
    executionId: z.string().uuid(),
    executionReceiptId: z.string().uuid(),
    sessionId: sessionIdSchema,
    command: z.string().trim().min(1).max(1000),
    stdout: z.string().max(25000).default(''),
    stderr: z.string().max(25000).default(''),
    exitCode: z.number().int().min(-1).max(255),
  }).strict(),
]);

type OwnedNode = {
  id: string;
  node_key: string;
  label: string;
  role: 'operator' | 'target' | 'infrastructure';
  os_family: string;
  status: string;
  runtime_provider: string;
  runtime_external_id: string | null;
  operation_slug: string;
  mode: string;
  run_status: string;
  expires_at: string | Date;
  run_metadata: Record<string, unknown> | null;
};

function platformFor(osFamily: string): 'linux' | 'windows' {
  return osFamily.toLowerCase().includes('windows') ? 'windows' : 'linux';
}

function shellFor(osFamily: string) {
  return platformFor(osFamily) === 'windows' ? 'powershell' : 'bash';
}

async function resolveOwnedNode(ownerId: string, runId: string, nodeId: string): Promise<OwnedNode | null> {
  const result = await getPool().query(
    `SELECT node.id,node.node_key,node.label,node.role,node.os_family,node.status,
            node.runtime_provider,node.runtime_external_id,
            run.operation_slug,run.mode,run.status AS run_status,run.expires_at,run.metadata AS run_metadata
       FROM operation_nodes node
       JOIN operation_runs run ON run.id=node.run_id
      WHERE run.id=$1 AND node.id=$2 AND run.owner_id=$3
      LIMIT 1`,
    [runId, nodeId, ownerId]
  );
  return result.rows[0] || null;
}

function readinessError(node: OwnedNode) {
  if (node.mode === 'warroom') return { status: 403, error: 'AI Practitioner is intentionally unavailable in War Room.' };
  if (node.run_metadata?.lifecycleState === 'paused') return { status: 409, error: 'Resume the Operation before approving an AI command.' };
  if (['destroying', 'destroyed', 'failed'].includes(node.run_status)) return { status: 409, error: 'This Operation is not active.' };
  if (new Date(node.expires_at).getTime() <= Date.now()) return { status: 410, error: 'This Operation has expired.' };
  if (['destroying', 'destroyed', 'failed'].includes(node.status)) return { status: 409, error: 'This Operation machine is not active.' };
  if (node.runtime_provider !== 'aws-ec2' || !node.runtime_external_id) return { status: 409, error: 'This Operation machine does not support managed terminal execution.' };
  return null;
}

export async function POST(request: NextRequest, context: { params: Promise<{ id: string; nodeId: string }> }) {
  return requireAuth(request, async (req, user) => {
    if (!(await validateCsrfToken(req))) return NextResponse.json({ error: 'Invalid or missing CSRF token' }, { status: 403 });
    const rateLimit = await checkRateLimit(req, { maxRequests: 24, windowMs: 60_000 }, `${user.id}:operation-ai-terminal`);
    if (rateLimit) return rateLimit;

    const { id, nodeId } = await context.params;
    if (!uuidSchema.safeParse(id).success || !uuidSchema.safeParse(nodeId).success) {
      return NextResponse.json({ error: 'A valid Operation run and machine are required.' }, { status: 400 });
    }
    const parsed = schema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ error: 'Invalid interactive Operation AI terminal request' }, { status: 400 });

    const validation = validatePractitionerCommand(parsed.data.command);
    if (!validation.ok) return NextResponse.json({ error: validation.error }, { status: 400 });

    const node = await resolveOwnedNode(user.id, id, nodeId);
    if (!node) return NextResponse.json({ error: 'Operation machine not found.' }, { status: 404 });
    const blocked = readinessError(node);
    if (blocked) return NextResponse.json({ error: blocked.error }, { status: blocked.status });

    const platform = platformFor(node.os_family);
    const shell = shellFor(node.os_family);

    try {
      if (parsed.data.action === 'authorize') {
        const evidence = await authorizeOperationTerminalEvidence({
          ownerId: user.id,
          runId: id,
          nodeId,
          command: parsed.data.command,
          metadata: {
            risk: validation.risk,
            operationSlug: node.operation_slug,
            operationMode: node.mode,
            nodeKey: node.node_key,
            nodeLabel: node.label,
            nodeRole: node.role,
            osFamily: node.os_family,
            platform,
            shell,
          },
        });
        await getPool().query(
          `INSERT INTO ai_practitioner_events (
             owner_id, operation_run_id, operation_node_id, event_type, command, metadata
           ) VALUES ($1,$2,$3,'execution-approved',$4,$5::jsonb)`,
          [
            user.id,
            id,
            nodeId,
            sanitizePostgresText(parsed.data.command),
            stringifyPostgresJson({
              risk: validation.risk,
              operationSlug: node.operation_slug,
              operationMode: node.mode,
              nodeLabel: node.label,
              nodeRole: node.role,
              platform,
              shell,
              executionId: evidence.executionId,
              evidenceId: evidence.id,
              provenance: evidence.provenance,
              surface: 'ai-practitioner',
            }),
          ]
        );
        return NextResponse.json({
          authorization: {
            command: parsed.data.command,
            risk: validation.risk,
            operationRunId: id,
            operationNodeId: nodeId,
            executionId: evidence.executionId,
            evidenceId: evidence.id,
            expiresAt: evidence.expiresAt,
            provenance: evidence.provenance,
            surface: 'ai-practitioner',
          },
        });
      }

      if (parsed.data.action === 'begin') {
        let activeSession;
        try {
          activeSession = await verifyActiveTerminalExecutionSession(node.runtime_external_id!, parsed.data.sessionId);
        } catch (error) {
          if (error instanceof TerminalExecutionSessionError) {
            return NextResponse.json({ error: error.message, code: error.code }, { status: 409, headers: { 'Cache-Control': 'no-store' } });
          }
          return NextResponse.json(
            { error: 'Oxsig could not verify the active Operation terminal session.', code: 'TERMINAL_SESSION_VERIFY_FAILED' },
            { status: 503, headers: { 'Cache-Control': 'no-store' } }
          );
        }

        const receipt = await beginBoundOperationTerminalExecution({
          ownerId: user.id,
          runId: id,
          nodeId,
          executionId: parsed.data.executionId,
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
            surface: 'ai-practitioner',
          },
        }, { headers: { 'Cache-Control': 'no-store' } });
      }

      const evidence = await recordBoundOperationTerminalEvidence({
        ownerId: user.id,
        runId: id,
        nodeId,
        executionId: parsed.data.executionId,
        executionReceiptId: parsed.data.executionReceiptId,
        terminalSessionId: parsed.data.sessionId,
        command: parsed.data.command,
        stdout: truncatePractitionerEvidence(parsed.data.stdout),
        stderr: truncatePractitionerEvidence(parsed.data.stderr),
        exitCode: parsed.data.exitCode,
      });

      await getPool().query(
        `INSERT INTO ai_practitioner_events (
           owner_id, operation_run_id, operation_node_id, event_type,
           command, stdout, stderr, exit_code, metadata
         ) VALUES ($1,$2,$3,'execution',$4,$5,$6,$7,$8::jsonb)`,
        [
          user.id,
          id,
          nodeId,
          evidence.command,
          evidence.stdout,
          evidence.stderr,
          evidence.exitCode ?? -1,
          stringifyPostgresJson({
            risk: validation.risk,
            operationSlug: node.operation_slug,
            operationMode: node.mode,
            nodeLabel: node.label,
            nodeRole: node.role,
            platform,
            shell,
            executionId: evidence.executionId,
            evidenceId: evidence.id,
            provenance: evidence.provenance,
            executionReceiptId: evidence.executionReceiptId,
            terminalSessionId: evidence.terminalSessionId,
            receiptBinding: 'exact-operation-node-session-bound',
            surface: 'ai-practitioner',
          }),
        ]
      );

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
          surface: 'ai-practitioner',
        },
      }, { headers: { 'Cache-Control': 'no-store' } });
    } catch (error) {
      if (error instanceof ExecutionEvidenceConflictError) {
        return NextResponse.json({ error: error.message, code: error.code }, { status: 409, headers: { 'Cache-Control': 'no-store' } });
      }
      throw error;
    }
  });
}
