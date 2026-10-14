import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { destroyStandaloneLab } from '@/lib/account/lifecycle';
import { UUID_PATTERN, withPlatformAdmin } from '@/lib/admin/http';
import { listAdminResources } from '@/lib/admin/queries';
import { getRequestMetadata, logAudit } from '@/lib/audit/logger';
import { getPool } from '@/lib/db/pool';
import { destroyOperationRun } from '@/lib/operations/runtime';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const querySchema = z.object({ filter: z.enum(['live', 'failed', 'expired', 'all']).default('live') });
const destroySchema = z.object({ kind: z.enum(['lab', 'operation']), id: z.string().regex(UUID_PATTERN) }).strict();

export async function GET(request: NextRequest) {
  return withPlatformAdmin(request, async (req) => {
    const parsed = querySchema.safeParse(Object.fromEntries(req.nextUrl.searchParams));
    if (!parsed.success) return NextResponse.json({ error: 'Invalid resource filter' }, { status: 400 });
    return NextResponse.json({ resources: await listAdminResources(getPool(), parsed.data.filter) });
  });
}

/** Force-destroy a lab or operation run on behalf of its owner. */
export async function POST(request: NextRequest) {
  return withPlatformAdmin(request, async (req, admin) => {
    const parsed = destroySchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ error: 'Invalid destroy request' }, { status: 400 });
    const pool = getPool();
    let { kind, id } = parsed.data;

    if (kind === 'lab') {
      const result = await destroyStandaloneLab(pool, id);
      if (!result.found) return NextResponse.json({ error: 'Lab not found' }, { status: 404 });
      if (result.operationRunId) {
        // Operation-owned labs are torn down with their run so no sibling VM is orphaned.
        kind = 'operation';
        id = result.operationRunId;
      } else {
        await logAudit({ userId: admin.id, action: 'admin.lab.destroy', resourceType: 'lab', resourceId: id, ...getRequestMetadata(req) });
        return NextResponse.json({ ok: true, kind: 'lab', id });
      }
    }

    const run = await pool.query(`SELECT owner_id FROM operation_runs WHERE id=$1 LIMIT 1`, [id]);
    if (!run.rows[0]) return NextResponse.json({ error: 'Operation run not found' }, { status: 404 });
    await destroyOperationRun({ pool, runId: id, ownerId: run.rows[0].owner_id });
    await logAudit({ userId: admin.id, action: 'admin.operation.destroy', resourceType: 'operation_run', resourceId: id, ...getRequestMetadata(req) });
    return NextResponse.json({ ok: true, kind: 'operation', id });
  }, { mutation: true });
}
