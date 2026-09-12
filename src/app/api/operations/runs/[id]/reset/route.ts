import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAuth } from '@/lib/auth/middleware';
import { getPool } from '@/lib/db/pool';
import { advancePreparedEnvironmentReset } from '@/lib/operations/environment-reset';
import { validateCsrfToken } from '@/lib/security/csrf';
import { checkRateLimit } from '@/lib/security/rate-limit';

export const runtime = 'nodejs';

const idSchema = z.string().uuid();
const PRIVATE_HEADERS = { 'Cache-Control': 'private, no-store, max-age=0', Pragma: 'no-cache' };

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return requireAuth(request, async (req, user) => {
    if (!(await validateCsrfToken(req))) {
      return NextResponse.json({ error: 'Invalid or missing CSRF token' }, { status: 403, headers: PRIVATE_HEADERS });
    }
    const { id } = await params;
    if (!idSchema.safeParse(id).success) {
      return NextResponse.json({ error: 'Invalid Operation run' }, { status: 400, headers: PRIVATE_HEADERS });
    }
    const rateLimit = await checkRateLimit(req, { maxRequests: 240, windowMs: 60 * 60_000 }, `${user.id}:operation-reset`);
    if (rateLimit) return rateLimit;

    try {
      const pool = getPool();
      const owned = await pool.query(
        `SELECT environment_id FROM operation_runs
          WHERE id=$1 AND owner_id=$2 AND environment_id IS NOT NULL LIMIT 1`,
        [id, user.id],
      );
      const environmentId = owned.rows[0]?.environment_id as string | undefined;
      if (!environmentId) {
        return NextResponse.json({ error: 'This Operation does not use a reusable environment.' }, { status: 404, headers: PRIVATE_HEADERS });
      }
      const reset = await advancePreparedEnvironmentReset({ pool, environmentId });
      return NextResponse.json({ reset }, { headers: PRIVATE_HEADERS });
    } catch (error) {
      console.error('Prepared Operation reset progression failed:', error);
      return NextResponse.json({ error: 'Could not progress the reusable environment reset.' }, { status: 500, headers: PRIVATE_HEADERS });
    }
  });
}
