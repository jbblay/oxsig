import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAuth } from '@/lib/auth/middleware';
import { getPool } from '@/lib/db/pool';
import { getOperationLifecycleProgress, OperationLifecycleError } from '@/lib/operations/lifecycle';
import { getOperationRun, OperationRuntimeError } from '@/lib/operations/runtime';
import { getLearnerOperationRun, OperationRunReadError } from '@/lib/operations/run-view';
import { validateCsrfToken } from '@/lib/security/csrf';
import { checkRateLimit } from '@/lib/security/rate-limit';

export const runtime = 'nodejs';

const idSchema = z.string().uuid();
const PRIVATE_HEADERS = { 'Cache-Control': 'private, no-store, max-age=0', Pragma: 'no-cache' };
const TERMINAL_STATUSES = new Set(['failed', 'destroying', 'destroyed']);

function errorResponse(error: unknown) {
  if (error instanceof OperationRuntimeError || error instanceof OperationLifecycleError || error instanceof OperationRunReadError) {
    return NextResponse.json({ error: error.message, code: error.code }, { status: error.status, headers: PRIVATE_HEADERS });
  }
  console.error('Operation reconciliation failed:', error);
  return NextResponse.json({ error: 'Could not refresh the Operation runtime' }, { status: 500, headers: PRIVATE_HEADERS });
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return requireAuth(request, async (req, user) => {
    if (!(await validateCsrfToken(req))) {
      return NextResponse.json({ error: 'Invalid or missing CSRF token' }, { status: 403, headers: PRIVATE_HEADERS });
    }

    const { id } = await params;
    if (!idSchema.safeParse(id).success) {
      return NextResponse.json({ error: 'Invalid Operation run' }, { status: 400, headers: PRIVATE_HEADERS });
    }

    const rateLimit = await checkRateLimit(
      req,
      { maxRequests: 180, windowMs: 10 * 60_000 },
      `${user.id}:operation-reconcile:${id}`,
    );
    if (rateLimit) return rateLimit;

    try {
      const pool = getPool();
      const durable = await getLearnerOperationRun({ pool, runId: id, ownerId: user.id });
      if (TERMINAL_STATUSES.has(durable.status)) {
        return NextResponse.json({ run: durable, lifecycle: null }, { headers: PRIVATE_HEADERS });
      }

      // This is the only learner-triggered path allowed to observe AWS and persist
      // transitional Operation readiness. Ordinary GET requests remain DB-only.
      const run = await getOperationRun({ pool, runId: id, ownerId: user.id });
      let lifecycle = null;
      if (run.metadata?.lifecycleState === 'paused') {
        try {
          lifecycle = await getOperationLifecycleProgress({ pool, runId: id, ownerId: user.id });
        } catch (error) {
          console.error('Operation lifecycle reconciliation failed:', error);
          lifecycle = { phase: 'pausing' as const, total: run.nodes.length, stopped: 0, nodeStates: {} };
        }
      }
      return NextResponse.json({ run, lifecycle }, { headers: PRIVATE_HEADERS });
    } catch (error) {
      return errorResponse(error);
    }
  });
}
