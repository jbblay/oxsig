import { NextRequest, NextResponse } from 'next/server';
import type { Pool } from 'pg';
import { z } from 'zod';
import { requireAuth } from '@/lib/auth/middleware';
import { getPool } from '@/lib/db/pool';
import { validateCsrfToken } from '@/lib/security/csrf';
import { checkRateLimit } from '@/lib/security/rate-limit';
import {
  getOperationLifecycleProgress,
  pauseOperationRun,
  resumeOperationRun,
  OperationLifecycleError,
  type OperationLifecycleProgress,
} from '@/lib/operations/lifecycle';
import { destroyOperationRun, getOperationRun, OperationRuntimeError } from '@/lib/operations/runtime';
import { AUDIT_ACTIONS, getRequestMetadata, logAudit } from '@/lib/audit/logger';

export const runtime = 'nodejs';
const idSchema = z.string().uuid();
const actionSchema = z.object({ action: z.enum(['pause', 'resume']) }).strict();
const PRIVATE_HEADERS = { 'Cache-Control': 'private, no-store, max-age=0', Pragma: 'no-cache' };

type OperationRunView = Awaited<ReturnType<typeof getOperationRun>>;

function errorResponse(error: unknown) {
  if (error instanceof OperationRuntimeError || error instanceof OperationLifecycleError) {
    return NextResponse.json({ error: error.message, code: error.code }, { status: error.status, headers: PRIVATE_HEADERS });
  }
  console.error('Operation run request failed:', error);
  return NextResponse.json({ error: 'Could not operate the Operation run' }, { status: 500, headers: PRIVATE_HEADERS });
}

async function readLifecycleProgress(pool: Pool, run: OperationRunView, ownerId: string): Promise<OperationLifecycleProgress | null> {
  if (run.metadata?.lifecycleState !== 'paused') return null;
  try {
    return await getOperationLifecycleProgress({ pool, runId: run.id, ownerId });
  } catch (error) {
    // Fail closed for the learner controls. If provider state cannot be confirmed,
    // keep Resume disabled instead of exposing a button that can race EC2 stopping.
    console.error('Operation lifecycle progress check failed:', error);
    return { phase: 'pausing', total: run.nodes.length, stopped: 0, nodeStates: {} };
  }
}

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return requireAuth(request, async (_req, user) => {
    const { id } = await params;
    if (!idSchema.safeParse(id).success) return NextResponse.json({ error: 'Invalid Operation run' }, { status: 400, headers: PRIVATE_HEADERS });
    try {
      const pool = getPool();
      const run = await getOperationRun({ pool, runId: id, ownerId: user.id });
      const lifecycle = await readLifecycleProgress(pool, run, user.id);
      return NextResponse.json({ run, lifecycle }, { headers: PRIVATE_HEADERS });
    } catch (error) {
      return errorResponse(error);
    }
  });
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return requireAuth(request, async (req, user) => {
    if (!(await validateCsrfToken(req))) return NextResponse.json({ error: 'Invalid or missing CSRF token' }, { status: 403, headers: PRIVATE_HEADERS });
    const { id } = await params;
    if (!idSchema.safeParse(id).success) return NextResponse.json({ error: 'Invalid Operation run' }, { status: 400, headers: PRIVATE_HEADERS });
    const parsed = actionSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ error: 'Invalid Operation lifecycle action' }, { status: 400, headers: PRIVATE_HEADERS });

    const rateLimit = await checkRateLimit(req, { maxRequests: 12, windowMs: 60 * 60_000 }, `${user.id}:operation-lifecycle`);
    if (rateLimit) return rateLimit;

    try {
      const pool = getPool();
      const result = parsed.data.action === 'pause'
        ? await pauseOperationRun({ pool, runId: id, ownerId: user.id })
        : await resumeOperationRun({ pool, runId: id, ownerId: user.id });

      await logAudit({
        userId: user.id,
        action: parsed.data.action === 'pause' ? AUDIT_ACTIONS.LAB_STOP : AUDIT_ACTIONS.LAB_START,
        resourceType: 'operation-run',
        resourceId: id,
        ...getRequestMetadata(req),
        metadata: { lifecycleAction: parsed.data.action, wholeOperation: true },
      });

      const run = await getOperationRun({ pool, runId: id, ownerId: user.id });
      const lifecycle = await readLifecycleProgress(pool, run, user.id);
      return NextResponse.json({ ...result, run, lifecycle }, { headers: PRIVATE_HEADERS });
    } catch (error) {
      return errorResponse(error);
    }
  });
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return requireAuth(request, async (req, user) => {
    if (!(await validateCsrfToken(req))) return NextResponse.json({ error: 'Invalid or missing CSRF token' }, { status: 403, headers: PRIVATE_HEADERS });
    const { id } = await params;
    if (!idSchema.safeParse(id).success) return NextResponse.json({ error: 'Invalid Operation run' }, { status: 400, headers: PRIVATE_HEADERS });
    const rateLimit = await checkRateLimit(req, { maxRequests: 12, windowMs: 60 * 60_000 }, `${user.id}:operation-destroy`);
    if (rateLimit) return rateLimit;
    try {
      const result = await destroyOperationRun({ pool: getPool(), runId: id, ownerId: user.id });
      return NextResponse.json(result, { headers: PRIVATE_HEADERS });
    } catch (error) {
      return errorResponse(error);
    }
  });
}