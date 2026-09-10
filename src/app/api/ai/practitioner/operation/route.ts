import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAuth } from '@/lib/auth/middleware';
import { getPool } from '@/lib/db/pool';
import { sanitizePostgresText, stringifyPostgresJson } from '@/lib/db/postgres-safe';
import { validateCsrfToken } from '@/lib/security/csrf';
import { checkRateLimit } from '@/lib/security/rate-limit';
import { getOperation } from '@/lib/operations/catalog';
import {
  aiPractitionerConfigured,
  aiPractitionerModel,
  explainPractitionerEvidence,
  planPractitionerStep,
  type PractitionerOperationContext,
} from '@/lib/ai-practitioner/server';
import {
  ExecutionEvidenceConflictError,
  getTerminalEvidenceForAnalysis,
  storeExecutionEvidenceAnalysis,
} from '@/lib/execution-evidence/server';

export const runtime = 'nodejs';

const historyItem = z.object({ role: z.enum(['user', 'assistant']), content: z.string().max(4000) }).strict();
const requestSchema = z.discriminatedUnion('action', [
  z.object({
    action: z.literal('plan'),
    runId: z.string().uuid(),
    nodeId: z.string().uuid(),
    prompt: z.string().trim().min(1).max(4000),
    history: z.array(historyItem).max(10).default([]),
  }).strict(),
  z.object({
    action: z.literal('explain'),
    runId: z.string().uuid(),
    nodeId: z.string().uuid(),
    evidenceId: z.string().uuid(),
    prompt: z.string().trim().min(1).max(4000),
    command: z.string().trim().min(1).max(1000),
    stdout: z.string().max(20000).default(''),
    stderr: z.string().max(20000).default(''),
    exitCode: z.number().int().min(-1).max(255),
  }).strict(),
]);

type OperationNodeRow = {
  id: string;
  node_key: string;
  label: string;
  role: 'operator' | 'target' | 'infrastructure';
  os_family: string;
  status: string;
  runtime_external_id: string | null;
  private_ip: string | null;
  operation_slug: string;
  mode: 'practice' | 'walkthrough' | 'challenge' | 'warroom';
  run_status: string;
  expires_at: string | Date;
  run_metadata: Record<string, unknown> | null;
};

type TimelineEntry = {
  id: string;
  prompt: string;
  plan: Record<string, unknown>;
  operationNodeId: string;
  targetLabel?: string;
  execution?: Record<string, unknown>;
  analysis?: Record<string, unknown>;
};

function metadata(row: Record<string, any>) {
  return row.metadata && typeof row.metadata === 'object' ? row.metadata as Record<string, unknown> : {};
}

function platformFor(osFamily: string): 'linux' | 'windows' {
  return osFamily.toLowerCase().includes('windows') ? 'windows' : 'linux';
}

function shellFor(osFamily: string) {
  return platformFor(osFamily) === 'windows' ? 'powershell' : 'bash';
}

async function resolveOwnedOperationNode(ownerId: string, runId: string, nodeId: string) {
  const result = await getPool().query(
    `SELECT node.id,node.node_key,node.label,node.role,node.os_family,node.status,node.runtime_external_id,
            node.private_ip::text,
            run.operation_slug,run.mode,run.status AS run_status,run.expires_at,run.metadata AS run_metadata
       FROM operation_nodes node
       JOIN operation_runs run ON run.id=node.run_id
      WHERE run.id=$1 AND node.id=$2 AND run.owner_id=$3
      LIMIT 1`,
    [runId, nodeId, ownerId]
  );
  const node = result.rows[0] as OperationNodeRow | undefined;
  if (!node) return { error: 'Operation machine not found.', status: 404 as const };
  if (node.mode === 'warroom') return { error: 'AI Practitioner is intentionally unavailable in War Room.', status: 403 as const };
  if (node.run_metadata?.lifecycleState === 'paused') return { error: 'Resume the Operation to continue guided practice.', status: 409 as const };
  if (['destroying', 'destroyed', 'failed'].includes(node.run_status)) return { error: 'This Operation is not active.', status: 409 as const };
  if (new Date(node.expires_at).getTime() <= Date.now()) return { error: 'This Operation has expired.', status: 410 as const };
  return { node };
}

async function loadRunNodes(runId: string) {
  const result = await getPool().query(
    `SELECT id,node_key,label,role,os_family,status,private_ip::text
       FROM operation_nodes
      WHERE run_id=$1
      ORDER BY CASE role WHEN 'operator' THEN 0 WHEN 'target' THEN 1 ELSE 2 END,node_key`,
    [runId]
  );
  return result.rows as Array<Record<string, any>>;
}

function isExecutableNode(node: OperationNodeRow) {
  return Boolean(node.runtime_external_id) && !['destroying', 'destroyed', 'failed'].includes(node.status);
}

function findLatestEntry(entries: TimelineEntry[], row: Record<string, any>, requireExecution: boolean) {
  for (let index = entries.length - 1; index >= 0; index -= 1) {
    const entry = entries[index];
    if (requireExecution && !entry.execution) continue;
    if (!requireExecution && entry.execution) continue;
    if (row.operation_node_id && entry.operationNodeId !== String(row.operation_node_id)) continue;
    const command = typeof entry.plan.command === 'string' ? entry.plan.command : null;
    if (row.command && command && command !== String(row.command)) continue;
    return entry;
  }
  return null;
}

function restorable(entry: TimelineEntry) {
  const command = typeof entry.plan.command === 'string' ? entry.plan.command.trim() : '';
  return !command || Boolean(entry.execution);
}

export async function GET(request: NextRequest) {
  return requireAuth(request, async (req, user) => {
    const rateLimit = await checkRateLimit(req, { maxRequests: 60, windowMs: 60_000 }, `${user.id}:operation-practitioner-history`);
    if (rateLimit) return rateLimit;
    const runId = new URL(req.url).searchParams.get('runId');
    if (!runId || !z.string().uuid().safeParse(runId).success) {
      return NextResponse.json({ error: 'A valid Operation run is required.' }, { status: 400 });
    }
    const owner = await getPool().query(`SELECT id FROM operation_runs WHERE id=$1 AND owner_id=$2 LIMIT 1`, [runId, user.id]);
    if (!owner.rows[0]) return NextResponse.json({ error: 'Operation run not found.' }, { status: 404 });

    const result = await getPool().query(
      `WITH recent AS (
         SELECT id,operation_node_id,event_type,prompt,command,stdout,stderr,exit_code,metadata,created_at
           FROM ai_practitioner_events
          WHERE owner_id=$1 AND operation_run_id=$2
          ORDER BY created_at DESC
          LIMIT 100
       ) SELECT * FROM recent ORDER BY created_at ASC`,
      [user.id, runId]
    );
    const entries: TimelineEntry[] = [];
    const history: Array<{ id: string; role: 'user' | 'assistant'; content: string }> = [];

    for (const row of result.rows) {
      const eventMetadata = metadata(row);
      if (row.event_type === 'plan' && row.prompt && row.operation_node_id) {
        const plan = eventMetadata.plan;
        if (!plan || typeof plan !== 'object') continue;
        const entry: TimelineEntry = {
          id: String(row.id),
          prompt: String(row.prompt),
          plan: plan as Record<string, unknown>,
          operationNodeId: String(row.operation_node_id),
          targetLabel: typeof eventMetadata.targetLabel === 'string' ? eventMetadata.targetLabel : undefined,
        };
        entries.push(entry);
        history.push({ id: `${row.id}:user`, role: 'user', content: String(row.prompt) });
        const explanation = (plan as Record<string, unknown>).explanation;
        if (typeof explanation === 'string' && explanation.trim()) history.push({ id: `${row.id}:plan`, role: 'assistant', content: explanation });
        continue;
      }
      if (row.event_type === 'execution') {
        const entry = findLatestEntry(entries, row, false);
        if (!entry) continue;
        entry.execution = {
          command: String(row.command || ''),
          stdout: String(row.stdout || ''),
          stderr: String(row.stderr || ''),
          exitCode: Number(row.exit_code ?? -1),
          risk: eventMetadata.risk,
          executionId: eventMetadata.executionId,
          evidenceId: eventMetadata.evidenceId,
          provenance: eventMetadata.provenance,
          executionReceiptId: eventMetadata.executionReceiptId,
          terminalSessionId: eventMetadata.terminalSessionId,
          surface: 'ai-practitioner',
        };
        continue;
      }
      if (row.event_type === 'analysis') {
        const analysis = eventMetadata.analysis;
        if (!analysis || typeof analysis !== 'object') continue;
        const entry = findLatestEntry(entries, row, true);
        if (!entry) continue;
        entry.analysis = analysis as Record<string, unknown>;
        const summary = (analysis as Record<string, unknown>).summary;
        if (typeof summary === 'string' && summary.trim()) history.push({ id: `${row.id}:analysis`, role: 'assistant', content: summary });
      }
    }

    return NextResponse.json({ entries: entries.filter(restorable), history }, { headers: { 'Cache-Control': 'no-store' } });
  });
}

export async function POST(request: NextRequest) {
  return requireAuth(request, async (req, user) => {
    if (!(await validateCsrfToken(req))) return NextResponse.json({ error: 'Invalid or missing CSRF token' }, { status: 403 });
    const rateLimit = await checkRateLimit(req, { maxRequests: 24, windowMs: 60_000 }, `${user.id}:operation-practitioner`);
    if (rateLimit) return rateLimit;

    const parsed = requestSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ error: 'Invalid Operation AI Practitioner request', details: parsed.error.flatten() }, { status: 400 });
    if (!aiPractitionerConfigured()) return NextResponse.json({ error: 'AI Practitioner is not configured on this Oxsig server', code: 'AI_NOT_CONFIGURED' }, { status: 503 });
    const model = aiPractitionerModel();
    if (!model) return NextResponse.json({ error: 'AI Practitioner model is not configured on this Oxsig server', code: 'AI_MODEL_NOT_CONFIGURED' }, { status: 503 });

    const resolved = await resolveOwnedOperationNode(user.id, parsed.data.runId, parsed.data.nodeId);
    if ('error' in resolved) return NextResponse.json({ error: resolved.error }, { status: resolved.status });
    const node = resolved.node;
    const operation = getOperation(node.operation_slug);
    if (!operation) return NextResponse.json({ error: 'Operation definition is unavailable.' }, { status: 409 });

    try {
      if (parsed.data.action === 'plan') {
        const allNodes = await loadRunNodes(parsed.data.runId);
        const operationContext: PractitionerOperationContext = {
          codename: operation.codename,
          mode: node.mode,
          summary: operation.summary,
          objectives: operation.objectives,
          topology: operation.topology,
          nodeLabel: node.label,
          nodeRole: node.role,
          nodes: allNodes.map((item) => ({
            label: String(item.label),
            role: String(item.role),
            osFamily: String(item.os_family),
            privateIp: item.private_ip ? String(item.private_ip) : null,
          })),
        };
        const executable = isExecutableNode(node);
        const plan = await planPractitionerStep({
          prompt: parsed.data.prompt,
          history: parsed.data.history,
          lab: executable ? {
            name: `${operation.codename} — ${node.label}`,
            platform: platformFor(node.os_family),
            shell: shellFor(node.os_family),
            operation: operationContext,
          } : null,
        });

        await getPool().query(
          `INSERT INTO ai_practitioner_events (
             owner_id,operation_run_id,operation_node_id,event_type,prompt,command,model,metadata
           ) VALUES ($1,$2,$3,'plan',$4,$5,$6,$7::jsonb)`,
          [
            user.id,
            parsed.data.runId,
            parsed.data.nodeId,
            sanitizePostgresText(parsed.data.prompt),
            plan.command ? sanitizePostgresText(plan.command) : null,
            sanitizePostgresText(model),
            stringifyPostgresJson({
              plan,
              targetLabel: node.label,
              targetRole: node.role,
              osFamily: node.os_family,
              operationSlug: node.operation_slug,
              operationMode: node.mode,
            }),
          ]
        );

        return NextResponse.json({
          plan,
          model,
          target: {
            runId: parsed.data.runId,
            nodeId: parsed.data.nodeId,
            label: node.label,
            role: node.role,
            osFamily: node.os_family,
            privateIp: node.private_ip,
            executable,
          },
        });
      }

      const evidence = await getTerminalEvidenceForAnalysis({
        ownerId: user.id,
        command: parsed.data.command,
        surface: 'ai-practitioner',
        evidenceId: parsed.data.evidenceId,
      });
      if (evidence.payload.operationRunId !== parsed.data.runId || evidence.payload.operationNodeId !== parsed.data.nodeId) {
        throw new ExecutionEvidenceConflictError(
          'Execution evidence belongs to a different Operation machine.',
          'EVIDENCE_OPERATION_TARGET_MISMATCH'
        );
      }

      if (evidence.state === 'analyzed') {
        if (evidence.analysisKind !== 'ai-practitioner' || !evidence.analysis) {
          throw new ExecutionEvidenceConflictError('This execution evidence was already analyzed by another learning surface.', 'EVIDENCE_ALREADY_ANALYZED');
        }
        return NextResponse.json({ analysis: evidence.analysis, model: evidence.model || model });
      }

      const analysis = await explainPractitionerEvidence({
        prompt: parsed.data.prompt,
        command: evidence.command || parsed.data.command,
        stdout: evidence.stdout,
        stderr: evidence.stderr,
        exitCode: evidence.exitCode ?? -1,
        labName: `${operation.codename} — ${node.label}`,
        platform: platformFor(node.os_family),
      });
      await storeExecutionEvidenceAnalysis({
        ownerId: user.id,
        evidenceId: evidence.id,
        analysisKind: 'ai-practitioner',
        analysis: analysis as unknown as Record<string, unknown>,
        model,
      });
      await getPool().query(
        `INSERT INTO ai_practitioner_events (
           owner_id,operation_run_id,operation_node_id,event_type,prompt,command,exit_code,model,metadata
         ) VALUES ($1,$2,$3,'analysis',$4,$5,$6,$7,$8::jsonb)`,
        [
          user.id,
          parsed.data.runId,
          parsed.data.nodeId,
          sanitizePostgresText(parsed.data.prompt),
          sanitizePostgresText(evidence.command || parsed.data.command),
          evidence.exitCode ?? -1,
          sanitizePostgresText(model),
          stringifyPostgresJson({
            analysis,
            evidenceId: evidence.id,
            executionId: evidence.executionId,
            provenance: evidence.provenance,
            targetLabel: node.label,
            operationSlug: node.operation_slug,
          }),
        ]
      );
      return NextResponse.json({ analysis, model });
    } catch (error) {
      if (error instanceof ExecutionEvidenceConflictError) {
        return NextResponse.json({ error: error.message, code: error.code }, { status: 409, headers: { 'Cache-Control': 'no-store' } });
      }
      console.error('Operation AI Practitioner request failed:', error);
      return NextResponse.json({ error: error instanceof Error ? error.message : 'Operation AI Practitioner failed' }, { status: 502 });
    }
  });
}
