import { NextRequest, NextResponse } from 'next/server';
import type { Pool } from 'pg';
import { z } from 'zod';
import { requireAuth } from '@/lib/auth/middleware';
import { getPool } from '@/lib/db/pool';
import { validateCsrfToken } from '@/lib/security/csrf';
import { checkRateLimit } from '@/lib/security/rate-limit';
import { provisionRegisteredOperationRun, OperationRuntimeError } from '@/lib/operations/runtime-registry';

export const runtime = 'nodejs';

const bodySchema = z.object({ mode: z.enum(['practice','walkthrough','challenge','warroom']) }).strict();
const slugSchema = z.string().min(1).max(120).regex(/^[a-z0-9-]+$/);
const PRIVATE_HEADERS = { 'Cache-Control': 'private, no-store' };

type ExistingRunRow = {
  id: string;
  operation_slug: string;
  mode: string;
  status: string;
  operator_lab_instance_id: string | null;
  environment_id: string | null;
  expires_at: string | Date | null;
};

function errorResponse(error: unknown) {
  if (error instanceof OperationRuntimeError) {
    return NextResponse.json({ error: error.message, code: error.code }, { status: error.status, headers: PRIVATE_HEADERS });
  }
  console.error('Operation provisioning failed:', error);
  return NextResponse.json(
    { error: 'Could not provision the Operation runtime', code: 'OPERATION_PROVISION_FAILED' },
    { status: 500, headers: PRIVATE_HEADERS },
  );
}

async function preflightOperationAllocation(
  pool: Pool,
  ownerId: string,
  slug: string,
  mode: string,
): Promise<NextResponse | null> {
  const activeRun = await pool.query(
    `SELECT id,operation_slug,mode,status,operator_lab_instance_id,environment_id,expires_at
       FROM operation_runs
      WHERE owner_id=$1
        AND status IN ('provisioning','running','destroying')
        AND (expires_at IS NULL OR expires_at > NOW())
      ORDER BY created_at DESC
      LIMIT 1`,
    [ownerId],
  );
  const existing = activeRun.rows[0] as ExistingRunRow | undefined;
  if (existing) {
    if (existing.operation_slug === slug && existing.mode === mode && existing.status !== 'destroying') {
      return NextResponse.json(
        {
          reused: true,
          run: {
            runId: existing.id,
            operatorLabInstanceId: existing.operator_lab_instance_id,
            environmentId: existing.environment_id,
            expiresAt: existing.expires_at,
            status: existing.status,
          },
        },
        { status: 200, headers: PRIVATE_HEADERS },
      );
    }
    return NextResponse.json(
      {
        error: existing.status === 'destroying'
          ? 'The current Operation is still ending. Wait for cleanup to finish before starting another.'
          : 'Another Operation is already active. Open or end it before starting a new one.',
        code: 'OPERATION_ALREADY_ACTIVE',
      },
      { status: 409, headers: PRIVATE_HEADERS },
    );
  }

  const activeLab = await pool.query(
    `SELECT id
       FROM lab_instances
      WHERE owner_id=$1
        AND status NOT IN ('destroying','destroyed','failed')
        AND (expires_at IS NULL OR expires_at > NOW())
      LIMIT 1`,
    [ownerId],
  );
  if (activeLab.rows.length > 0) {
    return NextResponse.json(
      {
        error: 'Stop or destroy your current Cyber Lab before starting a multi-node Operation.',
        code: 'OPERATION_LAB_SLOT_OCCUPIED',
      },
      { status: 409, headers: PRIVATE_HEADERS },
    );
  }

  if (slug === 'black-domain') {
    const environment = await pool.query(
      `SELECT status
         FROM operation_environments
        WHERE operation_slug=$1
          AND status <> 'available'
        ORDER BY updated_at DESC
        LIMIT 1`,
      [slug],
    );
    const environmentStatus = environment.rows[0]?.status as string | undefined;
    if (environmentStatus === 'failed') {
      return NextResponse.json(
        {
          error: 'Black Domain is temporarily unavailable while its clean environment is being repaired.',
          code: 'OPERATION_ENVIRONMENT_FAILED',
        },
        { status: 503, headers: PRIVATE_HEADERS },
      );
    }
    if (environmentStatus) {
      return NextResponse.json(
        {
          error: environmentStatus === 'resetting'
            ? 'Black Domain is still restoring its clean baseline. Try again when reset completes.'
            : 'Black Domain is still preparing its reusable environment. Try again shortly.',
          code: 'OPERATION_ENVIRONMENT_BUSY',
        },
        { status: 409, headers: PRIVATE_HEADERS },
      );
    }
  }

  return null;
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  return requireAuth(request, async (req, user) => {
    if (!(await validateCsrfToken(req))) {
      return NextResponse.json({ error: 'Invalid or missing CSRF token' }, { status: 403, headers: PRIVATE_HEADERS });
    }
    const { slug } = await params;
    if (!slugSchema.safeParse(slug).success) {
      return NextResponse.json({ error: 'Invalid Operation' }, { status: 400, headers: PRIVATE_HEADERS });
    }
    const parsed = bodySchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json({ error: 'Choose a supported Operation mode' }, { status: 400, headers: PRIVATE_HEADERS });
    }

    const pool = getPool();
    try {
      // Conflicts and idempotent retries are resolved before consuming the expensive
      // provisioning quota. Repeated clicks can no longer turn a harmless 409 into 429.
      const preflight = await preflightOperationAllocation(pool, user.id, slug, parsed.data.mode);
      if (preflight) return preflight;

      const rateLimit = await checkRateLimit(
        req,
        { maxRequests: 4, windowMs: 60 * 60_000 },
        `${user.id}:operation:${slug}`,
        `operation-provision:${slug}:v2`,
      );
      if (rateLimit) return rateLimit;

      const run = await provisionRegisteredOperationRun({
        pool,
        ownerId: user.id,
        slug,
        mode: parsed.data.mode,
      });
      return NextResponse.json({ run }, { status: 201, headers: PRIVATE_HEADERS });
    } catch (error) {
      return errorResponse(error);
    }
  });
}
