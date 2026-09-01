import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAuth } from '@/lib/auth/middleware';
import { validateCsrfToken } from '@/lib/security/csrf';
import { getPool } from '@/lib/db/pool';
import { LAB_CATALOG } from '@/lib/labs/catalog';
import { createLabContainer, labCapabilities } from '@/lib/labs/docker-runtime';
import { AUDIT_ACTIONS, getRequestMetadata, logAudit } from '@/lib/audit/logger';

export const runtime = 'nodejs';
const createSchema = z.object({ slug: z.string().max(120) }).strict();

function mapInstance(row: Record<string, any>) {
  return { id: row.id, slug: row.slug, name: row.name, status: row.status, lastError: row.last_error, createdAt: row.created_at, startedAt: row.started_at, expiresAt: row.expires_at };
}

export async function GET(request: NextRequest) {
  return requireAuth(request, async (_req, user) => {
    const [capabilities, instances] = await Promise.all([
      labCapabilities(),
      getPool().query(`SELECT instance.*, definition.slug, definition.name FROM lab_instances instance JOIN lab_definitions definition ON definition.id = instance.definition_id WHERE instance.owner_id = $1 AND instance.status <> 'destroyed' ORDER BY instance.created_at DESC LIMIT 20`, [user.id]),
    ]);
    return NextResponse.json({ catalog: LAB_CATALOG, capabilities, instances: instances.rows.map(mapInstance) });
  });
}

export async function POST(request: NextRequest) {
  return requireAuth(request, async (req, user) => {
    if (!(await validateCsrfToken(req))) return NextResponse.json({ error: 'Invalid or missing CSRF token' }, { status: 403 });
    const parsed = createSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ error: 'Invalid lab request' }, { status: 400 });
    const lab = LAB_CATALOG.find((item) => item.slug === parsed.data.slug && item.runtime === 'container');
    if (!lab || lab.slug !== 'kali-linux-foundations') return NextResponse.json({ error: 'This lab runtime is not available' }, { status: 400 });
    const capabilities = await labCapabilities();
    if (!capabilities.configured) return NextResponse.json({ error: capabilities.reason || 'Docker lab runtime is unavailable' }, { status: 503 });

    const pool = getPool();
    const definition = await pool.query(
      `INSERT INTO lab_definitions (slug, name, category, description, difficulty, runtime_kind, definition, enabled)
       VALUES ($1,$2,$3,$4,$5,$6,$7,true)
       ON CONFLICT (slug) DO UPDATE SET name=EXCLUDED.name, description=EXCLUDED.description, definition=EXCLUDED.definition, enabled=true, updated_at=NOW()
       RETURNING id`,
      [lab.slug, lab.name, lab.category, lab.description, lab.difficulty, lab.runtime, JSON.stringify({ objectives: lab.objectives })]
    );
    const created = await pool.query(
      `INSERT INTO lab_instances (definition_id, owner_id, status, runtime_provider, expires_at)
       VALUES ($1,$2,'provisioning','docker',NOW() + INTERVAL '2 hours') RETURNING id`,
      [definition.rows[0].id, user.id]
    );
    const instanceId = created.rows[0].id as string;
    try {
      const externalId = await createLabContainer(instanceId);
      const result = await pool.query(`UPDATE lab_instances SET status='running', runtime_external_id=$1, started_at=NOW(), updated_at=NOW() WHERE id=$2 RETURNING *`, [externalId, instanceId]);
      await pool.query(`INSERT INTO lab_events (lab_instance_id,event_type,payload) VALUES ($1,'started',$2)`, [instanceId, JSON.stringify({ provider: 'docker' })]);
      await logAudit({ userId: user.id, action: AUDIT_ACTIONS.LAB_CREATE, resourceType: 'lab', resourceId: instanceId, ...getRequestMetadata(req), metadata: { definition: lab.slug } });
      return NextResponse.json({ instance: mapInstance({ ...result.rows[0], slug: lab.slug, name: lab.name }) }, { status: 201 });
    } catch (error) {
      const message = error instanceof Error ? error.message.slice(0, 500) : 'Lab provisioning failed';
      await pool.query(`UPDATE lab_instances SET status='failed', last_error=$1, updated_at=NOW() WHERE id=$2`, [message, instanceId]);
      return NextResponse.json({ error: 'Lab provisioning failed', instanceId }, { status: 500 });
    }
  });
}
