import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAuth } from '@/lib/auth/middleware';
import { getPool } from '@/lib/db/pool';
import { stringifyPostgresJson } from '@/lib/db/postgres-safe';
import { validateCsrfToken } from '@/lib/security/csrf';
import { checkRateLimit } from '@/lib/security/rate-limit';
import { openOperationAccessSecret, sealOperationAccessSecret } from '@/lib/operations/access-secret';
import { getRequestMetadata, logAudit } from '@/lib/audit/logger';

export const runtime = 'nodejs';
const idSchema = z.string().uuid();

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return requireAuth(request, async (req, user) => {
    if (!(await validateCsrfToken(req))) {
      return NextResponse.json({ error: 'Invalid or missing CSRF token' }, { status: 403 });
    }
    const { id } = await params;
    if (!idSchema.safeParse(id).success) {
      return NextResponse.json({ error: 'Invalid Operation run' }, { status: 400 });
    }
    const rateLimit = await checkRateLimit(req, { maxRequests: 10, windowMs: 60 * 60_000 }, `${user.id}:operation-access`);
    if (rateLimit) return rateLimit;

    const pool = getPool();
    const result = await pool.query(
      `SELECT status,expires_at,metadata
         FROM operation_runs
        WHERE id=$1 AND owner_id=$2
        LIMIT 1`,
      [id, user.id]
    );
    const run = result.rows[0];
    if (!run) return NextResponse.json({ error: 'Operation run not found' }, { status: 404 });
    if (!['provisioning', 'running'].includes(run.status)) {
      return NextResponse.json({ error: 'Starting access is unavailable for this Operation state' }, { status: 409 });
    }
    if (run.expires_at && new Date(run.expires_at).getTime() <= Date.now()) {
      return NextResponse.json({ error: 'This Operation has expired' }, { status: 410 });
    }

    const metadata = run.metadata && typeof run.metadata === 'object' ? run.metadata as Record<string, unknown> : {};
    const rawAccess = metadata.initialAccess;
    const access = rawAccess && typeof rawAccess === 'object' && !Array.isArray(rawAccess)
      ? rawAccess as Record<string, unknown>
      : {};
    const username = typeof access.username === 'string' ? access.username : null;
    if (!username) return NextResponse.json({ error: 'Starting access is unavailable' }, { status: 404 });

    let password: string | null = null;
    if (typeof access.passwordSecret === 'string') {
      try {
        password = openOperationAccessSecret({ ownerId: user.id, runId: id, sealed: access.passwordSecret });
      } catch (error) {
        console.error('Operation credential decrypt failed:', { runId: id, error });
        return NextResponse.json({ error: 'Starting access could not be decrypted' }, { status: 500 });
      }
    } else if (typeof access.password === 'string') {
      // Legacy canonical runs stored this value in plaintext. Reveal it once through
      // the hardened path and opportunistically migrate the durable record.
      password = access.password;
      try {
        const passwordSecret = sealOperationAccessSecret({ ownerId: user.id, runId: id, password });
        const migratedAccess = { ...access, passwordSecret };
        delete migratedAccess.password;
        await pool.query(
          `UPDATE operation_runs
              SET metadata=metadata || $1::jsonb, updated_at=NOW()
            WHERE id=$2 AND owner_id=$3`,
          [stringifyPostgresJson({ initialAccess: migratedAccess }), id, user.id]
        );
      } catch (error) {
        console.warn('Operation legacy credential migration failed:', { runId: id, error });
      }
    }

    if (!password) return NextResponse.json({ error: 'Starting access is unavailable' }, { status: 404 });

    await logAudit({
      userId: user.id,
      action: 'operation.access.reveal',
      resourceType: 'operation-run',
      resourceId: id,
      ...getRequestMetadata(req),
    });

    return NextResponse.json(
      { username, password },
      { headers: { 'Cache-Control': 'private, no-store', 'Pragma': 'no-cache' } }
    );
  });
}
