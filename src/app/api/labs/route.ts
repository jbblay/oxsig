import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAuth } from '@/lib/auth/middleware';
import { validateCsrfToken } from '@/lib/security/csrf';
import { checkRateLimit } from '@/lib/security/rate-limit';
import { getPool } from '@/lib/db/pool';
import { LAB_CATALOG } from '@/lib/labs/catalog';
import { createLabVm, describeLabVmStates, destroyLabVm, labCapabilities } from '@/lib/labs/aws-runtime';
import { AUDIT_ACTIONS, getRequestMetadata, logAudit } from '@/lib/audit/logger';

export const runtime = 'nodejs';
const createSchema = z.object({ slug: z.string().max(120) }).strict();

const configuredTtl = Number.parseInt(process.env.LAB_AWS_TTL_MINUTES || '60', 10);
const LAB_TTL_MINUTES = Number.isFinite(configuredTtl) ? Math.min(120, Math.max(15, configuredTtl)) : 60;
const ONE_LAB_INDEX = 'idx_lab_instances_one_nonterminal_per_owner';

function mapInstance(row: Record<string, any>) {
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    status: row.status,
    lastError: row.last_error,
    createdAt: row.created_at,
    startedAt: row.started_at,
    expiresAt: row.expires_at,
  };
}

async function syncAwsInstances(rows: Record<string, any>[]) {
  const pool = getPool();
  const now = Date.now();

  for (const row of rows) {
    if (
      row.runtime_provider === 'aws-ec2' &&
      row.runtime_external_id &&
      row.expires_at &&
      new Date(row.expires_at).getTime() <= now &&
      !['destroying', 'destroyed', 'failed'].includes(row.status)
    ) {
      try {
        await destroyLabVm(row.runtime_external_id);
        row.status = 'destroying';
        await pool.query(
          `UPDATE lab_instances SET status='destroying', updated_at=NOW() WHERE id=$1`,
          [row.id]
        );
      } catch {
        // The scheduled cleanup endpoint will retry expired instances independently.
      }
    }
  }

  const externalIds = rows
    .filter((row) => row.runtime_provider === 'aws-ec2' && row.runtime_external_id && row.status !== 'failed')
    .map((row) => row.runtime_external_id as string);

  if (externalIds.length === 0) return rows;

  const states = await describeLabVmStates(externalIds);
  for (const row of rows) {
    if (!row.runtime_external_id) continue;
    const status = states.get(row.runtime_external_id);
    if (!status || status === row.status) continue;

    row.status = status;
    await pool.query(
      `UPDATE lab_instances
       SET status=$1,
           started_at=CASE WHEN $1='running' AND started_at IS NULL THEN NOW() ELSE started_at END,
           stopped_at=CASE WHEN $1='stopped' THEN NOW() ELSE stopped_at END,
           updated_at=NOW()
       WHERE id=$2`,
      [status, row.id]
    );
  }

  return rows;
}

export async function GET(request: NextRequest) {
  return requireAuth(request, async (_req, user) => {
    const capabilities = await labCapabilities();
    const instances = await getPool().query(
      `SELECT instance.*, definition.slug, definition.name
       FROM lab_instances instance
       JOIN lab_definitions definition ON definition.id = instance.definition_id
       WHERE instance.owner_id = $1 AND instance.status <> 'destroyed'
       ORDER BY instance.created_at DESC
       LIMIT 20`,
      [user.id]
    );

    let rows = instances.rows;
    if (capabilities.configured) {
      try {
        rows = await syncAwsInstances(rows);
      } catch {
        // A temporary AWS read failure should not hide the user's stored lab state.
      }
    }

    return NextResponse.json({ catalog: LAB_CATALOG, capabilities, instances: rows.map(mapInstance) });
  });
}

export async function POST(request: NextRequest) {
  return requireAuth(request, async (req, user) => {
    if (!(await validateCsrfToken(req))) {
      return NextResponse.json({ error: 'Invalid or missing CSRF token' }, { status: 403 });
    }

    const rateLimit = await checkRateLimit(
      req,
      { maxRequests: 5, windowMs: 10 * 60_000 },
      user.id
    );
    if (rateLimit) return rateLimit;

    const parsed = createSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ error: 'Invalid lab request' }, { status: 400 });

    const lab = LAB_CATALOG.find((item) => item.slug === parsed.data.slug && item.runtime === 'vm' && item.available);
    if (!lab) return NextResponse.json({ error: 'This lab runtime is not available' }, { status: 400 });

    const capabilities = await labCapabilities();
    if (!capabilities.configured) {
      return NextResponse.json({ error: capabilities.reason || 'AWS lab runtime is unavailable' }, { status: 503 });
    }

    const pool = getPool();
    const active = await pool.query(
      `SELECT COUNT(*)::int AS count
       FROM lab_instances
       WHERE owner_id=$1
         AND status NOT IN ('destroying','destroyed','failed')
         AND (expires_at IS NULL OR expires_at > NOW())`,
      [user.id]
    );
    if ((active.rows[0]?.count || 0) >= 1) {
      return NextResponse.json({ error: 'The MVP allows one active cloud lab per user. Stop or destroy the current lab first.' }, { status: 409 });
    }

    const definition = await pool.query(
      `INSERT INTO lab_definitions (slug, name, category, description, difficulty, runtime_kind, definition, enabled)
       VALUES ($1,$2,$3,$4,$5,$6,$7,true)
       ON CONFLICT (slug) DO UPDATE
         SET name=EXCLUDED.name,
             category=EXCLUDED.category,
             description=EXCLUDED.description,
             difficulty=EXCLUDED.difficulty,
             runtime_kind=EXCLUDED.runtime_kind,
             definition=EXCLUDED.definition,
             enabled=true,
             updated_at=NOW()
       RETURNING id`,
      [lab.slug, lab.name, lab.category, lab.description, lab.difficulty, lab.runtime, JSON.stringify({ objectives: lab.objectives })]
    );

    let created;
    try {
      created = await pool.query(
        `INSERT INTO lab_instances (definition_id, owner_id, status, runtime_provider, expires_at)
         VALUES ($1,$2,'provisioning','aws-ec2',NOW() + ($3 * INTERVAL '1 minute'))
         RETURNING id, expires_at`,
        [definition.rows[0].id, user.id, LAB_TTL_MINUTES]
      );
    } catch (error: any) {
      if (error?.code === '23505' && error?.constraint === ONE_LAB_INDEX) {
        return NextResponse.json(
          { error: 'A cloud lab allocation already exists for this account. Wait for cleanup or destroy it before creating another.' },
          { status: 409 }
        );
      }
      throw error;
    }

    const instanceId = created.rows[0].id as string;
    const expiresAt = new Date(created.rows[0].expires_at).toISOString();
    let externalId: string | undefined;

    try {
      const provisioned = await createLabVm(instanceId, user.id, expiresAt);
      externalId = provisioned.externalId;

      const result = await pool.query(
        `UPDATE lab_instances
         SET runtime_external_id=$1,
             metadata=$2,
             last_error=NULL,
             updated_at=NOW()
         WHERE id=$3
         RETURNING *`,
        [
          provisioned.externalId,
          JSON.stringify({ region: provisioned.region, imageId: provisioned.imageId, instanceType: provisioned.instanceType }),
          instanceId,
        ]
      );

      await pool.query(
        `INSERT INTO lab_events (lab_instance_id,event_type,payload)
         VALUES ($1,'provisioned',$2)`,
        [instanceId, JSON.stringify({ provider: 'aws-ec2', externalId: provisioned.externalId })]
      );

      await logAudit({
        userId: user.id,
        action: AUDIT_ACTIONS.LAB_CREATE,
        resourceType: 'lab',
        resourceId: instanceId,
        ...getRequestMetadata(req),
        metadata: { definition: lab.slug, provider: 'aws-ec2' },
      });

      return NextResponse.json(
        { instance: mapInstance({ ...result.rows[0], slug: lab.slug, name: lab.name }) },
        { status: 201 }
      );
    } catch (error) {
      if (externalId) {
        try {
          await destroyLabVm(externalId);
        } catch {
          // The instance remains tagged for scheduled administrative cleanup if AWS cleanup itself fails.
        }
      }

      const message = error instanceof Error ? error.message.slice(0, 500) : 'Lab provisioning failed';
      await pool.query(
        `UPDATE lab_instances SET status='failed', last_error=$1, updated_at=NOW() WHERE id=$2`,
        [message, instanceId]
      );
      return NextResponse.json({ error: 'Lab provisioning failed', instanceId }, { status: 500 });
    }
  });
}
