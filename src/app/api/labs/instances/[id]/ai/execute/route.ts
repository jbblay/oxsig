import { stringifyPostgresJson } from '@/lib/db/postgres-safe';
import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth/middleware';
import { getPool } from '@/lib/db/pool';
import { validateCsrfToken } from '@/lib/security/csrf';
import { checkRateLimit } from '@/lib/security/rate-limit';
import { LAB_CATALOG } from '@/lib/labs/catalog';
import { executeLabCommand } from '@/lib/labs/aws-runtime';
import {
  practitionerExecuteSchema,
  truncatePractitionerEvidence,
  validatePractitionerCommand,
} from '@/lib/ai-practitioner/server';

export const runtime = 'nodejs';

export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  return requireAuth(request, async (req, user) => {
    if (!(await validateCsrfToken(req))) {
      return NextResponse.json({ error: 'Invalid or missing CSRF token' }, { status: 403 });
    }

    const rateLimit = await checkRateLimit(req, { maxRequests: 12, windowMs: 60_000 }, user.id);
    if (rateLimit) return rateLimit;

    const parsed = practitionerExecuteSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json({ error: 'A single explicitly approved command is required' }, { status: 400 });
    }

    const validation = validatePractitionerCommand(parsed.data.command);
    if (!validation.ok) return NextResponse.json({ error: validation.error }, { status: 400 });

    const { id } = await context.params;
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
      [id, user.id]
    );
    const instance = result.rows[0];
    if (!instance) return NextResponse.json({ error: 'Lab instance not found' }, { status: 404 });
    if (instance.expires_at && new Date(instance.expires_at).getTime() <= Date.now()) {
      return NextResponse.json({ error: 'The Cyber Lab session has expired' }, { status: 410 });
    }
    if (instance.status !== 'running') {
      return NextResponse.json({ error: 'The Cyber Lab machine must be running before AI can execute a command' }, { status: 409 });
    }
    if (instance.runtime_provider !== 'aws-ec2' || !instance.runtime_external_id) {
      return NextResponse.json({ error: 'This lab does not support managed command execution' }, { status: 409 });
    }

    const lab = LAB_CATALOG.find((item) => item.slug === instance.slug);
    if (!lab) return NextResponse.json({ error: 'Lab definition is unavailable' }, { status: 409 });

    try {
      const execution = await executeLabCommand(
        instance.runtime_external_id,
        parsed.data.command,
        lab.platform
      );
      const stdout = truncatePractitionerEvidence(execution.stdout || '');
      const stderr = truncatePractitionerEvidence(execution.stderr || '');
      const exitCode = execution.exitCode ?? 1;

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
          exitCode,
          stringifyPostgresJson({ risk: validation.risk, platform: lab.platform, shell: lab.shell }),
        ]
      );

      return NextResponse.json({
        execution: {
          command: parsed.data.command,
          stdout,
          stderr,
          exitCode,
          risk: validation.risk,
        },
      });
    } catch (error) {
      console.error('AI Practitioner execution failed:', error);
      return NextResponse.json({
        error: error instanceof Error ? error.message : 'Lab command execution failed',
      }, { status: 502 });
    }
  });
}
