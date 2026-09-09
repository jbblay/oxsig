import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth/middleware';
import { getPool } from '@/lib/db/pool';
import { getOperationRun } from '@/lib/operations/runtime';

export const runtime = 'nodejs';

const RECONCILE_STATUSES = new Set(['provisioning', 'running', 'destroying']);

export async function GET(request: NextRequest) {
  return requireAuth(request, async (_req, user) => {
    const pool = getPool();
    const result = await pool.query(
      `SELECT id, operation_slug, mode, status, operator_lab_instance_id,
              expires_at, last_error, created_at, updated_at
         FROM operation_runs
        WHERE owner_id=$1
        ORDER BY CASE WHEN status IN ('provisioning','running','destroying') THEN 0 ELSE 1 END,
                 created_at DESC
        LIMIT 8`,
      [user.id]
    );

    const runs = [];
    for (const row of result.rows) {
      let status = row.status as string;
      let operatorLabInstanceId = row.operator_lab_instance_id as string | null;
      let lastError = row.last_error as string | null;

      if (RECONCILE_STATUSES.has(status)) {
        try {
          const reconciled = await getOperationRun({
            pool,
            runId: row.id,
            ownerId: user.id,
          });
          status = reconciled.status;
          operatorLabInstanceId = reconciled.operatorLabInstanceId || operatorLabInstanceId;
          lastError = reconciled.lastError;
        } catch (error) {
          // Discovery remains available even if AWS reconciliation is temporarily
          // unavailable; opening the run performs the normal detailed retry path.
          console.warn('Operation run discovery reconciliation failed', { runId: row.id, error });
        }
      }

      runs.push({
        id: row.id,
        operationSlug: row.operation_slug,
        mode: row.mode,
        status,
        operatorLabInstanceId,
        expiresAt: row.expires_at,
        lastError,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
      });
    }

    return NextResponse.json({ runs }, { headers: { 'Cache-Control': 'private, no-store' } });
  });
}
