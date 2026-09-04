import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth/middleware';
import { getPool } from '@/lib/db/pool';
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

export const runtime = 'nodejs';

async function resolveOwnedRunningLab(ownerId: string, labInstanceId: string) {
  const result = await getPool().query(
    `SELECT id, slug, status, runtime_provider, runtime_external_id
     FROM lab_instances
     WHERE id = $1 AND owner_id = $2 AND status <> 'destroyed'
     LIMIT 1`,
    [labInstanceId, ownerId]
  );
  const instance = result.rows[0];
  if (!instance) return { error: 'Lab instance not found', status: 404 as const };
  if (instance.status !== 'running') return { error: 'AI Practitioner requires a running Cyber Lab machine', status: 409 as const };

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

    const parsed = practitionerRequestSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid AI Practitioner request', details: parsed.error.flatten() }, { status: 400 });
    }

    if (!aiPractitionerConfigured()) {
      return NextResponse.json({
        error: 'AI Practitioner is not configured on this Oxsig server',
        code: 'AI_NOT_CONFIGURED',
      }, { status: 503 });
    }

    const resolved = await resolveOwnedRunningLab(user.id, parsed.data.labInstanceId);
    if ('error' in resolved) return NextResponse.json({ error: resolved.error }, { status: resolved.status });

    const { instance, lab } = resolved;
    const model = aiPractitionerModel();

    try {
      if (parsed.data.action === 'plan') {
        const plan = await planPractitionerStep({
          prompt: parsed.data.prompt,
          history: parsed.data.history,
          labName: lab.name,
          platform: lab.platform,
          shell: lab.shell,
        });

        await getPool().query(
          `INSERT INTO ai_practitioner_events (
             owner_id, lab_instance_id, event_type, prompt, command, model, metadata
           ) VALUES ($1,$2,'plan',$3,$4,$5,$6::jsonb)`,
          [user.id, instance.id, parsed.data.prompt, plan.command, model, JSON.stringify({ plan })]
        );

        return NextResponse.json({
          plan,
          model,
          lab: { id: instance.id, name: lab.name, platform: lab.platform, shell: lab.shell },
        });
      }

      const analysis = await explainPractitionerEvidence({
        prompt: parsed.data.prompt,
        command: parsed.data.command,
        stdout: parsed.data.stdout,
        stderr: parsed.data.stderr,
        exitCode: parsed.data.exitCode,
        labName: lab.name,
        platform: lab.platform,
      });

      await getPool().query(
        `INSERT INTO ai_practitioner_events (
           owner_id, lab_instance_id, event_type, prompt, command, exit_code, model, metadata
         ) VALUES ($1,$2,'analysis',$3,$4,$5,$6,$7::jsonb)`,
        [
          user.id,
          instance.id,
          parsed.data.prompt,
          parsed.data.command,
          parsed.data.exitCode,
          model,
          JSON.stringify({ analysis }),
        ]
      );

      return NextResponse.json({ analysis, model });
    } catch (error) {
      console.error('AI Practitioner request failed:', error);
      return NextResponse.json({
        error: error instanceof Error ? error.message : 'AI Practitioner failed',
      }, { status: 502 });
    }
  });
}
