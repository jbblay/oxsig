import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAuth } from '@/lib/auth/middleware';
import { getPool } from '@/lib/db/pool';
import { sanitizePostgresText, stringifyPostgresJson } from '@/lib/db/postgres-safe';
import { validateCsrfToken } from '@/lib/security/csrf';
import { checkRateLimit } from '@/lib/security/rate-limit';
import { LAB_CATALOG } from '@/lib/labs/catalog';
import {
  aiPractitionerConfigured,
  aiPractitionerModel,
  explainPractitionerEvidence,
  planPractitionerStep,
  practitionerRequestSchema,
} from '@/lib/ai-practitioner/server';
import {
  ExecutionEvidenceConflictError,
  getTerminalEvidenceForAnalysis,
  storeExecutionEvidenceAnalysis,
} from '@/lib/execution-evidence/server';

export const runtime = 'nodejs';

const evidenceIdSchema = z.string().uuid();

async function resolveOwnedRunningLab(ownerId: string, labInstanceId: string) {
  const result = await getPool().query(
    `SELECT instance.id,
            definition.slug,
            instance.status,
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

    if (!aiPractitionerConfigured()) {
      return NextResponse.json({
        error: 'AI Practitioner is not configured on this Oxsig server',
        code: 'AI_NOT_CONFIGURED',
      }, { status: 503 });
    }

    const model = aiPractitionerModel();

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
        });

        await getPool().query(
          `INSERT INTO ai_practitioner_events (
             owner_id, lab_instance_id, event_type, prompt, command, model, metadata
           ) VALUES ($1,$2,'plan',$3,$4,$5,$6::jsonb)`,
          [
            user.id,
            instance?.id ?? null,
            sanitizePostgresText(parsed.data.prompt),
            sanitizePostgresText(plan.command),
            sanitizePostgresText(model),
            stringifyPostgresJson({ plan }),
          ]
        );

        return NextResponse.json({
          plan,
          model,
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
      });

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
      console.error('AI Practitioner request failed:', error);
      return NextResponse.json({
        error: error instanceof Error ? error.message : 'AI Practitioner failed',
      }, { status: 502 });
    }
  });
}
