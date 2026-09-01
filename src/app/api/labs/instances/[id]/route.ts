import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAuth } from '@/lib/auth/middleware';
import { validateCsrfToken } from '@/lib/security/csrf';
import { getPool } from '@/lib/db/pool';
import { destroyLabContainer, resetLabContainer, startLabContainer, stopLabContainer } from '@/lib/labs/docker-runtime';
import { AUDIT_ACTIONS, getRequestMetadata, logAudit } from '@/lib/audit/logger';

export const runtime = 'nodejs';
const actionSchema = z.object({ action: z.enum(['start', 'stop', 'reset', 'destroy']) }).strict();

export async function PATCH(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  return requireAuth(request, async (req, user) => {
    if (!(await validateCsrfToken(req))) return NextResponse.json({ error: 'Invalid or missing CSRF token' }, { status: 403 });
    const parsed = actionSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ error: 'Invalid lab action' }, { status: 400 });
    const { id } = await context.params;
    const pool = getPool();
    const owned = await pool.query(`SELECT id,status FROM lab_instances WHERE id=$1 AND owner_id=$2 AND status <> 'destroyed'`, [id, user.id]);
    if (!owned.rows[0]) return NextResponse.json({ error: 'Lab instance not found' }, { status: 404 });
    const action = parsed.data.action;
    try {
      if (action === 'start') await startLabContainer(id);
      if (action === 'stop') await stopLabContainer(id);
      if (action === 'reset') await resetLabContainer(id);
      if (action === 'destroy') await destroyLabContainer(id);
      const status = action === 'stop' ? 'stopped' : action === 'destroy' ? 'destroyed' : 'running';
      const result = await pool.query(`UPDATE lab_instances SET status=$1, last_error=NULL, updated_at=NOW(), started_at=CASE WHEN $1='running' THEN NOW() ELSE started_at END, stopped_at=CASE WHEN $1='stopped' THEN NOW() ELSE stopped_at END WHERE id=$2 AND owner_id=$3 RETURNING *`, [status, id, user.id]);
      await pool.query(`INSERT INTO lab_events (lab_instance_id,event_type) VALUES ($1,$2)`, [id, action]);
      const auditAction = { start: AUDIT_ACTIONS.LAB_START, stop: AUDIT_ACTIONS.LAB_STOP, reset: AUDIT_ACTIONS.LAB_RESET, destroy: AUDIT_ACTIONS.LAB_DESTROY }[action];
      await logAudit({ userId: user.id, action: auditAction, resourceType: 'lab', resourceId: id, ...getRequestMetadata(req) });
      return NextResponse.json({ instance: result.rows[0] });
    } catch (error) {
      const message = error instanceof Error ? error.message.slice(0, 500) : 'Lab action failed';
      await pool.query(`UPDATE lab_instances SET status='failed', last_error=$1, updated_at=NOW() WHERE id=$2 AND owner_id=$3`, [message, id, user.id]);
      return NextResponse.json({ error: 'Lab action failed' }, { status: 500 });
    }
  });
}
