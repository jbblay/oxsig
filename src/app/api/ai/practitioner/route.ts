import { randomUUID } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAuth } from '@/lib/auth/middleware';
import { getPool } from '@/lib/db/pool';
import { sanitizePostgresText, stringifyPostgresJson } from '@/lib/db/postgres-safe';
import { validateCsrfToken } from '@/lib/security/csrf';
import { checkRateLimit } from '@/lib/security/rate-limit';
import { LAB_CATALOG } from '@/lib/labs/catalog';
import {
  AiRequestCancelledError,
  AiRequestTimeoutError,
} from '@/lib/ai/providers/server';
import {
  aiPractitionerConfigured,
  aiPractitionerModel,
  aiPractitionerPlanSchema,
  explainPractitionerEvidence,
  planPractitionerStep,
  practitionerRequestSchema,
} from '@/lib/ai-practitioner/server';
import type { AiPractitionerPlan } from '@/lib/ai-practitioner/types';
import {
  ExecutionEvidenceConflictError,
  getTerminalEvidenceForAnalysis,
  storeExecutionEvidenceAnalysis,
} from '@/lib/execution-evidence/server';

export const runtime = 'nodejs';

const evidenceIdSchema = z.string().uuid();

type TimelineEntry = {
  id: string;
  prompt: string;
  plan: Record<string, unknown>;
  requestId?: string;
  labInstanceId?: string;
  execution?: Record<string, unknown>;
  analysis?: Record<string, unknown>;
};

type TimelineLine = {
  id: string;
  role: 'user' | 'assistant';
  content: string;
};

type PersistedPlan = {
  prompt: string;
  plan: AiPractitionerPlan;
  model: string | null;
  labInstanceId: string | null;
};

function metadata(row: Record<string, any>) {
  return row.metadata && typeof row.metadata === 'object'
    ? row.metadata as Record<string, unknown>
    : {};
}

function latestMatchingEntry(entries: TimelineEntry[], row: Record<string, any>, requireExecution: boolean) {
  for (let index = entries.length - 1; index >= 0; index -= 1) {
    const entry = entries[index];
    if (requireExecution && !entry.execution) continue;
    if (!requireExecution && entry.execution) continue;
    if (row.prompt && entry.prompt !== String(row.prompt)) continue;
    const planCommand = typeof entry.plan.command === 'string' ? entry.plan.command : null;
    if (row.command && planCommand && planCommand !== String(row.command)) continue;
    if (row.lab_instance_id && entry.labInstanceId && entry.labInstanceId !== String(row.lab_instance_id)) continue;
    return entry;
  }
  return null;
}

function isRestorableEntry(entry: TimelineEntry) {
  const command = typeof entry.plan.command === 'string' ? entry.plan.command.trim() : '';
  // A persisted non-command answer is safe to restore as ordinary chat. A command
  // plan is executable context and may have been generated for a lab that no longer
  // exists or is no longer active; restore it only after real execution evidence
  // binds it to the original lab. Unfinished commands must be regenerated in the
  // current lab context rather than becoming clickable after a later refresh.
  return !command || Boolean(entry.execution);
}

async function findPersistedPlan(ownerId: string, requestId: string): Promise<PersistedPlan | null> {
  const result = await getPool().query(
    `SELECT lab_instance_id, prompt, model, metadata
       FROM ai_practitioner_events
      WHERE owner_id = $1
        AND event_type = 'plan'
        AND metadata->>'requestId' = $2
      ORDER BY created_at DESC
      LIMIT 1`,
    [ownerId, requestId]
  );
  const row = result.rows[0];
  if (!row?.prompt) return null;
  const parsedPlan = aiPractitionerPlanSchema.safeParse(metadata(row).plan);
  if (!parsedPlan.success) return null;
  return {
    prompt: String(row.prompt),
    plan: parsedPlan.data,
    model: row.model ? String(row.model) : null,
    labInstanceId: row.lab_instance_id ? String(row.lab_instance_id) : null,
  };
}

function persistedPlanResponse(persisted: PersistedPlan, requestId: string, fallbackModel: string | null) {
  return NextResponse.json({
    plan: persisted.plan,
    model: persisted.model || fallbackModel,
    lab: persisted.labInstanceId ? { id: persisted.labInstanceId } : null,
    requestId,
    replayed: true,
  }, { headers: { 'Cache-Control': 'no-store' } });
}

export async function GET(request: NextRequest) {
  return requireAuth(request, async (req, user) => {
    const rateLimit = await checkRateLimit(req, { maxRequests: 60, windowMs: 60_000 }, user.id);
    if (rateLimit) return rateLimit;

    const result = await getPool().query(
      `WITH recent AS (
         SELECT id, lab_instance_id, event_type, prompt, command, stdout, stderr,
                exit_code, metadata, created_at
           FROM ai_practitioner_events
          WHERE owner_id = $1
          ORDER BY created_at DESC
          LIMIT 100
       )
       SELECT * FROM recent ORDER BY created_at ASC`,
      [user.id]
    );

    const entries: TimelineEntry[] = [];
    const history: TimelineLine[] = [];
    const completedRequestIds = new Set<string>();

    for (const row of result.rows) {
      const eventMetadata = metadata(row);
      if (row.event_type === 'plan') {
        const plan = eventMetadata.plan;
        if (!plan || typeof plan !== 'object' || !row.prompt) continue;
        const requestId = typeof eventMetadata.requestId === 'string' ? eventMetadata.requestId : undefined;
        if (requestId) completedRequestIds.add(requestId);
        const entry: TimelineEntry = {
          id: String(row.id),
          prompt: String(row.prompt),
          plan: plan as Record<string, unknown>,
          ...(requestId ? { requestId } : {}),
          ...(row.lab_instance_id ? { labInstanceId: String(row.lab_instance_id) } : {}),
        };
        entries.push(entry);
        history.push({ id: `${row.id}:user`, role: 'user', content: String(row.prompt) });
        const explanation = (plan as Record<string, unknown>).explanation;
        if (typeof explanation === 'string' && explanation.trim()) {
          history.push({ id: `${row.id}:plan`, role: 'assistant', content: explanation });
        }
        continue;
      }

      if (row.event_type === 'execution') {
        const entry = latestMatchingEntry(entries, row, false);
        if (!entry) continue;
        if (row.lab_instance_id) entry.labInstanceId = String(row.lab_instance_id);
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
        const entry = latestMatchingEntry(entries, row, true);
        if (!entry) continue;
        if (row.lab_instance_id) entry.labInstanceId = String(row.lab_instance_id);
        entry.analysis = analysis as Record<string, unknown>;
        const summary = (analysis as Record<string, unknown>).summary;
        if (typeof summary === 'string' && summary.trim()) {
          history.push({ id: `${row.id}:analysis`, role: 'assistant', content: summary });
        }
      }
    }

    return NextResponse.json(
      {
        entries: entries.filter(isRestorableEntry),
        history,
        completedRequestIds: Array.from(completedRequestIds),
      },
      { headers: { 'Cache-Control': 'no-store' } }
    );
  });
}

async function resolveOwnedRunningLab(ownerId: string, labInstanceId: string) {
  const result = await getPool().query(
    `SELECT instance.id,
            definition.slug,
            instance.status,
            instance.expires_at,
            instance.runtime_provider,
            instance.runtime_external_id
     FROM lab_instances instance
     JOIN lab_definitions definition ON definition.id = instance.definition_id
     WHERE instance.id = $1 AND instance.owner_id = $2 AND instance.status <> 'destroyed'
     LIMIT 1`,
    [labInstanceId, ownerId]
  );
  const instance = result.rows[0];
  if (!instance) return { error: 'Lab instance not found', status: 404 as const };
  if (instance.expires_at && new Date(instance.expires_at).getTime() <= Date.now()) return { error: 'The Cyber Lab session has expired', status: 410 as const };
  if (instance.status !== 'running') return { error: 'AI Practitioner requires a running Cyber Lab machine for command execution', status: 409 as const };

  const lab = LAB_CATALOG.find((item) => item.slug === instance.slug);
  if (!lab) return { error: 'Lab definition is unavailable', status: 409 as const };
  return { instance, lab };
}

export async function POST(request: NextRequest) {
  return requireAuth(request, async (req, user) => {
    if (!(await validateCsrfToken(req))) {
      return NextResponse.json({ error: 'Invalid or missing CSRF token' }, { status: 403 });
    }

    const rateLimit = await checkRateLimit(req, { maxRequests: 24, windowMs: 60_000 }, user.id);
    if (rateLimit) return rateLimit;

    const rawBody = await req.json().catch(() => null) as Record<string, unknown> | null;
    let exactEvidenceId: string | undefined;
    let schemaBody: Record<string, unknown> | null = rawBody;
    if (rawBody?.action === 'explain') {
      const parsedEvidenceId = evidenceIdSchema.safeParse(rawBody.evidenceId);
      if (!parsedEvidenceId.success) {
        return NextResponse.json({ error: 'An exact execution evidence ID is required for AI explanation' }, { status: 400 });
      }
      exactEvidenceId = parsedEvidenceId.data;
      schemaBody = { ...rawBody };
      delete schemaBody.evidenceId;
    }

    const parsed = practitionerRequestSchema.safeParse(schemaBody);
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid AI Practitioner request', details: parsed.error.flatten() }, { status: 400 });
    }

    const requestId = parsed.data.action === 'plan'
      ? parsed.data.requestId || randomUUID()
      : null;

    if (requestId && parsed.data.action === 'plan') {
      const persisted = await findPersistedPlan(user.id, requestId);
      if (persisted) {
        if (persisted.prompt !== parsed.data.prompt || persisted.labInstanceId !== (parsed.data.labInstanceId ?? null)) {
          return NextResponse.json({
            error: 'This AI request identifier is already bound to another prompt or lab',
            code: 'AI_REQUEST_ID_CONFLICT',
          }, { status: 409, headers: { 'Cache-Control': 'no-store' } });
        }
        return persistedPlanResponse(persisted, requestId, persisted.model);
      }
    }

    if (!aiPractitionerConfigured()) {
      return NextResponse.json({
        error: 'AI Practitioner is not configured on this Oxsig server',
        code: 'AI_NOT_CONFIGURED',
      }, { status: 503 });
    }

    const model = aiPractitionerModel();
    if (!model) {
      return NextResponse.json({
        error: 'AI Practitioner model is not configured on this Oxsig server',
        code: 'AI_MODEL_NOT_CONFIGURED',
      }, { status: 503 });
    }

    try {
      if (parsed.data.action === 'plan') {
        let instance: any = null;
        let lab: (typeof LAB_CATALOG)[number] | null = null;

        if (parsed.data.labInstanceId) {
          const resolved = await resolveOwnedRunningLab(user.id, parsed.data.labInstanceId);
          if ('error' in resolved) return NextResponse.json({ error: resolved.error }, { status: resolved.status });
          instance = resolved.instance;
          lab = resolved.lab;
        }

        const plan = await planPractitionerStep({
          prompt: parsed.data.prompt,
          history: parsed.data.history,
          lab: lab ? { name: lab.name, platform: lab.platform, shell: lab.shell } : null,
          signal: req.signal,
        });
        if (req.signal.aborted) throw new AiRequestCancelledError();

        const insert = await getPool().query(
          `INSERT INTO ai_practitioner_events (
             owner_id, lab_instance_id, event_type, prompt, command, model, metadata
           ) VALUES ($1,$2,'plan',$3,$4,$5,$6::jsonb)
           ON CONFLICT DO NOTHING
           RETURNING id`,
          [
            user.id,
            instance?.id ?? null,
            sanitizePostgresText(parsed.data.prompt),
            plan.command ? sanitizePostgresText(plan.command) : null,
            sanitizePostgresText(model),
            stringifyPostgresJson({ plan, requestId }),
          ]
        );

        if (insert.rows.length === 0) {
          const persisted = await findPersistedPlan(user.id, requestId!);
          if (!persisted) throw new Error('AI plan could not be persisted safely');
          if (persisted.prompt !== parsed.data.prompt || persisted.labInstanceId !== (parsed.data.labInstanceId ?? null)) {
            return NextResponse.json({
              error: 'This AI request identifier is already bound to another prompt or lab',
              code: 'AI_REQUEST_ID_CONFLICT',
            }, { status: 409, headers: { 'Cache-Control': 'no-store' } });
          }
          return persistedPlanResponse(persisted, requestId!, model);
        }

        return NextResponse.json({
          plan,
          model,
          requestId,
          lab: instance && lab
            ? { id: instance.id, name: lab.name, platform: lab.platform, shell: lab.shell }
            : null,
        });
      }

      const resolved = await resolveOwnedRunningLab(user.id, parsed.data.labInstanceId);
      if ('error' in resolved) return NextResponse.json({ error: resolved.error }, { status: resolved.status });
      const { instance, lab } = resolved;

      const evidence = await getTerminalEvidenceForAnalysis({
        ownerId: user.id,
        labInstanceId: instance.id,
        command: parsed.data.command,
        surface: 'ai-practitioner',
        evidenceId: exactEvidenceId!,
      });

      if (evidence.state === 'analyzed') {
        if (evidence.analysisKind !== 'ai-practitioner' || !evidence.analysis) {
          throw new ExecutionEvidenceConflictError(
            'This execution evidence was already analyzed by another learning surface.',
            'EVIDENCE_ALREADY_ANALYZED'
          );
        }
        return NextResponse.json({
          analysis: evidence.analysis,
          model: evidence.model || model,
          evidence: {
            id: evidence.id,
            executionId: evidence.executionId,
            provenance: evidence.provenance,
            state: evidence.state,
          },
        });
      }

      const analysis = await explainPractitionerEvidence({
        prompt: parsed.data.prompt,
        command: evidence.command || parsed.data.command,
        stdout: evidence.stdout,
        stderr: evidence.stderr,
        exitCode: evidence.exitCode ?? -1,
        labName: lab.name,
        platform: lab.platform,
        signal: req.signal,
      });
      if (req.signal.aborted) throw new AiRequestCancelledError();

      const analyzedEvidence = await storeExecutionEvidenceAnalysis({
        ownerId: user.id,
        evidenceId: evidence.id,
        analysisKind: 'ai-practitioner',
        analysis: analysis as unknown as Record<string, unknown>,
        model,
      });

      await getPool().query(
        `INSERT INTO ai_practitioner_events (
           owner_id, lab_instance_id, event_type, prompt, command, exit_code, model, metadata
         ) VALUES ($1,$2,'analysis',$3,$4,$5,$6,$7::jsonb)`,
        [
          user.id,
          instance.id,
          sanitizePostgresText(parsed.data.prompt),
          sanitizePostgresText(evidence.command || parsed.data.command),
          evidence.exitCode ?? -1,
          sanitizePostgresText(model),
          stringifyPostgresJson({
            analysis,
            evidenceId: evidence.id,
            executionId: evidence.executionId,
            provenance: evidence.provenance,
          }),
        ]
      );

      return NextResponse.json({
        analysis,
        model,
        evidence: {
          id: analyzedEvidence.id,
          executionId: analyzedEvidence.executionId,
          provenance: analyzedEvidence.provenance,
          state: analyzedEvidence.state,
        },
      });
    } catch (error) {
      if (error instanceof ExecutionEvidenceConflictError) {
        return NextResponse.json(
          { error: error.message, code: error.code },
          { status: 409, headers: { 'Cache-Control': 'no-store' } }
        );
      }
      if (error instanceof AiRequestTimeoutError) {
        return NextResponse.json({
          error: 'AI request timed out. Your prompt is safe to retry.',
          code: error.code,
        }, { status: 504, headers: { 'Cache-Control': 'no-store' } });
      }
      if (error instanceof AiRequestCancelledError) {
        return NextResponse.json({
          error: 'AI request was cancelled.',
          code: error.code,
        }, { status: 499, headers: { 'Cache-Control': 'no-store' } });
      }
      console.error('AI Practitioner request failed:', error);
      return NextResponse.json({
        error: error instanceof Error ? error.message : 'AI Practitioner failed',
      }, { status: 502 });
    }
  });
}
