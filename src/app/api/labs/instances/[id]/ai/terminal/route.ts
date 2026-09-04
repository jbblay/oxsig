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

export const runtime = 'nodejs';

const terminalExecutionSchema = z.discriminatedUnion('action', [
  z.object({
    action: z.literal('authorize'),
    command: z.string().trim().min(1).max(1000),
    approved: z.literal(true),
  }).strict(),
  z.object({
    action: z.literal('record'),
    command: z.string().trim().min(1).max(1000),
    stdout: z.string().max(25000).default(''),
    stderr: z.string().max(25000).default(''),
    exitCode: z.number().int().min(-1).max(255),
  }).strict(),
]);

async function resolveOwnedRunningLab(ownerId: string, labInstanceId: string) {
  const result = await getPool().query(
    `SELECT instance.id, instance.status, instance.runtime_provider, instance.runtime_external_id,
            definition.slug
     FROM lab_instances instance
     JOIN lab_definitions definition ON definition.id = instance.definition_id
     WHERE instance.id = $1 AND instance.owner_id = $2 AND instance.status <> 'destroyed'
     LIMIT 1`,
    [labInstanceId, ownerId]
  );

  const instance = result.rows[0];
  if (!instance) return { error: 'Lab instance not found', status: 404 as const };
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

    if (parsed.data.action === 'authorize') {
      await getPool().query(
        `INSERT INTO ai_practitioner_events (
           owner_id, lab_instance_id, event_type, command, metadata
         ) VALUES ($1,$2,'execution-approved',$3,$4::jsonb)`,
        [
          user.id,
          instance.id,
          parsed.data.command,
          JSON.stringify({
            risk: validation.risk,
            platform: lab.platform,
            shell: lab.shell,
            executionMode: 'interactive-terminal',
          }),
        ]
      );

      return NextResponse.json({
        authorization: {
          command: parsed.data.command,
          risk: validation.risk,
          labInstanceId: instance.id,
        },
      });
    }

    const stdout = truncatePractitionerEvidence(parsed.data.stdout);
    const stderr = truncatePractitionerEvidence(parsed.data.stderr);

    await getPool().query(
      `INSERT INTO ai_practitioner_events (
         owner_id, lab_instance_id, event_type, command, stdout, stderr, exit_code, metadata
       ) VALUES ($1,$2,'execution',$3,$4,$5,$6,$7::jsonb)`,
      [
        user.id,
        instance.id,
        parsed.data.command,
        stdout,
        stderr,
        parsed.data.exitCode,
        JSON.stringify({
          risk: validation.risk,
          platform: lab.platform,
          shell: lab.shell,
          executionMode: 'interactive-terminal',
        }),
      ]
    );

    return NextResponse.json({
      execution: {
        command: parsed.data.command,
        stdout,
        stderr,
        exitCode: parsed.data.exitCode,
        risk: validation.risk,
      },
    });
  });
}
