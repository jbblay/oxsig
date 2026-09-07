import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getPool } from '@/lib/db/pool';
import { sanitizePostgresText, stringifyPostgresJson } from '@/lib/db/postgres-safe';
import { requireAuth } from '@/lib/auth/middleware';
import { validateCsrfToken } from '@/lib/security/csrf';
import { checkRateLimit } from '@/lib/security/rate-limit';
import { captureProductEvent } from '@/lib/analytics/posthog';
import { LAB_CATALOG } from '@/lib/labs/catalog';
import { resolveOwnedRunningLab } from '@/lib/labs/server';
import {
  aiPractitionerModel,
  analyzePractitionerExecution,
  planPractitionerStep,
} from '@/lib/ai-practitioner/server';

export const runtime = 'nodejs';

const planSchema = z.object({
  action: z.literal('plan'),
  prompt: z.string().trim().min(1).max(4000),
  labInstanceId: z.string().uuid().nullable().optional(),
  history: z.array(z.object({
    role: z.enum(['user', 'assistant']),
    content: z.string().max(4000),
  })).max(20).default([]),
});

const analyzeSchema = z.object({
  action: z.literal('analyze'),
  prompt: z.string().trim().min(1).max(4000),
  command: z.string().max(8000),
  stdout: z.string().max(120_000),
  stderr: z.string().max(120_000),
  exitCode: z.number().int(),
  labInstanceId: z.string().uuid().nullable().optional(),
  executionId: z.string().uuid().optional(),
});

const bodySchema = z.discriminatedUnion('action', [planSchema, analyzeSchema]);

export async function POST(request: NextRequest) {
  return requireAuth(request, async (req, user) => {
    if (!(await validateCsrfToken(req))) {
      return NextResponse.json({ error: 'Invalid or missing CSRF token' }, { status: 403 });
    }

    const rateLimit = await checkRateLimit(req, { maxRequests: 20, windowMs: 60_000 }, user.id);
    if (rateLimit) return rateLimit;

    const parsed = bodySchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid AI Practitioner request' }, { status: 400 });
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
        });

        await getPool().query(
          `INSERT INTO ai_practitioner_events (
             owner_id, lab_instance_id, event_type, prompt, command, model, metadata
           ) VALUES ($1,$2,'plan',$3,$4,$5,$6::jsonb)`,
          [
            user.id,
            instance?.id ?? null,
            sanitizePostgresText(parsed.data.prompt),
            plan.command ? sanitizePostgresText(plan.command) : null,
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

      let instance: any = null;
      let lab: (typeof LAB_CATALOG)[number] | null = null;
      if (parsed.data.labInstanceId) {
        const resolved = await resolveOwnedRunningLab(user.id, parsed.data.labInstanceId);
        if ('error' in resolved) return NextResponse.json({ error: resolved.error }, { status: resolved.status });
        instance = resolved.instance;
        lab = resolved.lab;
      }

      const analysis = await analyzePractitionerExecution({
        prompt: parsed.data.prompt,
        command: parsed.data.command,
        stdout: parsed.data.stdout,
        stderr: parsed.data.stderr,
        exitCode: parsed.data.exitCode,
        lab: lab ? { name: lab.name, platform: lab.platform, shell: lab.shell } : null,
      });

      await getPool().query(
        `INSERT INTO ai_practitioner_events (
           owner_id, lab_instance_id, event_type, prompt, command, stdout, stderr,
           exit_code, model, metadata
         ) VALUES ($1,$2,'analysis',$3,$4,$5,$6,$7,$8,$9::jsonb)`,
        [
          user.id,
          instance?.id ?? null,
          sanitizePostgresText(parsed.data.prompt),
          sanitizePostgresText(parsed.data.command),
          sanitizePostgresText(parsed.data.stdout),
          sanitizePostgresText(parsed.data.stderr),
          parsed.data.exitCode,
          sanitizePostgresText(model),
          stringifyPostgresJson({ analysis, executionId: parsed.data.executionId || null }),
        ]
      );

      await captureProductEvent({
        distinctId: user.clerkUserId || user.id,
        event: 'ai_practitioner_analysis_completed',
        properties: {
          labInstanceId: instance?.id ?? null,
          exitCode: parsed.data.exitCode,
        },
      });

      return NextResponse.json({ analysis, model });
    } catch (error) {
      console.error('AI Practitioner request failed:', error);
      return NextResponse.json({
        error: 'AI Practitioner could not complete this request',
        code: 'AI_PRACTITIONER_FAILED',
      }, { status: 500 });
    }
  });
}
