import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAuth } from '@/lib/auth/middleware';
import { validateCsrfToken } from '@/lib/security/csrf';
import { getPool } from '@/lib/db/pool';
import { executeLabCommand } from '@/lib/labs/aws-runtime';
import { AUDIT_ACTIONS, getRequestMetadata, logAudit } from '@/lib/audit/logger';

export const runtime = 'nodejs';
const commandSchema = z.object({ command: z.string().trim().min(1).max(1000) }).strict();

export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  return requireAuth(request, async (req, user) => {
    if (!(await validateCsrfToken(req))) {
      return NextResponse.json({ error: 'Invalid or missing CSRF token' }, { status: 403 });
    }

    const parsed = commandSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json({ error: 'Command must contain 1 to 1000 characters' }, { status: 400 });
    }

    const { id } = await context.params;
    const owned = await getPool().query(
      `SELECT id,runtime_provider,runtime_external_id
       FROM lab_instances
       WHERE id=$1
         AND owner_id=$2
         AND status='running'
         AND expires_at > NOW()`,
      [id, user.id]
    );
    const instance = owned.rows[0];
    if (!instance) return NextResponse.json({ error: 'Running lab instance not found' }, { status: 404 });
    if (instance.runtime_provider !== 'aws-ec2' || !instance.runtime_external_id) {
      return NextResponse.json({ error: 'This lab does not support the AWS command channel' }, { status: 409 });
    }

    try {
      const output = await executeLabCommand(instance.runtime_external_id, parsed.data.command);
      await logAudit({
        userId: user.id,
        action: AUDIT_ACTIONS.LAB_COMMAND,
        resourceType: 'lab',
        resourceId: id,
        ...getRequestMetadata(req),
        metadata: { length: parsed.data.command.length, provider: 'aws-ssm' },
      });
      return NextResponse.json(output);
    } catch (error) {
      return NextResponse.json(
        { error: error instanceof Error ? error.message : 'Command failed' },
        { status: 503 }
      );
    }
  });
}
