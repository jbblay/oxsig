import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAuth } from '@/lib/auth/middleware';
import { validateCsrfToken } from '@/lib/security/csrf';
import { checkRateLimit, RATE_LIMITS } from '@/lib/security/rate-limit';
import { getPool } from '@/lib/db/pool';
import { LAB_CATALOG } from '@/lib/labs/catalog';
import { createLabVm, describeLabVmStates, destroyLabVm, labCapabilities } from '@/lib/labs/aws-runtime';
import { AUDIT_ACTIONS, getRequestMetadata, logAudit } from '@/lib/audit/logger';
import { captureProductEvent } from '@/lib/analytics/posthog';

export const runtime = 'nodejs';
const createSchema = z.object({
  slug: z.string().max(120),
  accessMode: z.enum(['terminal', 'desktop']).optional(),
}).strict();

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
    metadata: row.metadata || {},
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
    .filter((row) => row.runtime_provider === 'aws-ec2' && row.runtime_external_id)
    .map((row) => row.runtime_external_id as string);

  if (externalIds.length === 0) return rows;

  const states = await describeLabVmStates(externalIds);
  for (const row of rows) {
    if (!row.runtime_external_id) continue;
    const status = states.get(row.runtime_external_id);
    if (!status || status === row.status) continue;

    row.status = status;
    if (status === 'destroyed') row.last_error = null;

    const isDestroyed = status === 'destroyed';
    const isRunning = status === 'running';
    const isStopped = status === 'stopped';

    await pool.query(
      `UPDATE lab_instances
       SET status=$1::varchar(32),
           last_error=CASE WHEN $2::boolean THEN NULL ELSE last_error END,
           started_at=CASE WHEN $3::boolean AND started_at IS NULL THEN NOW() ELSE started_at END,
           stopped_at=CASE WHEN $4::boolean THEN NOW() ELSE stopped_at END,
           updated_at=NOW()
       WHERE id=$5`,
      [status, isDestroyed, isRunning, isStopped, row.id]
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
    let reconciliationWarning: string | null = null;
    if (capabilities.configured) {
      try {
        rows = await syncAwsInstances(rows);
      } catch (error) {
        console.error('Cyber Lab AWS reconciliation failed', error);
        reconciliationWarning = 'Cloud state could not be reconciled. Refresh after AWS access is available.';
      }
    }

    const visibleRows = rows.filter((row) => row.status !== 'destroyed');
    return NextResponse.json({
      catalog: LAB_CATALOG,
      capabilities,
      instances: visibleRows.map(mapInstance),
      reconciliationWarning,
    });
  });
}

export async function POST(request: NextRequest) {
  return requireAuth(request, async (req, user) => {
    if (!(await validateCsrfToken(req))) {
      return NextResponse.json({ error: 'Invalid or missing CSRF token' }, { status: 403 });
    }

    const requestLimit = await checkRateLimit(
      req,
      { maxRequests: 20, windowMs: 60_000 },
      user.id
    );
    if (requestLimit) return requestLimit;

    const parsed = createSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ error: 'Invalid lab request' }, { status: 400 });

    const lab = LAB_CATALOG.find((item) => item.slug === parsed.data.slug && item.runtime === 'vm');
    if (!lab) return NextResponse.json({ error: 'This lab runtime is not available' }, { status: 400 });
    if (!lab.available) {
      return NextResponse.json(
        {
          error: lab.availabilityNote || `${lab.name} is not enabled yet`,
          code: lab.marketplaceProductCode ? 'MARKETPLACE_ACTIVATION_REQUIRED' : 'LAB_UNAVAILABLE',
          marketplaceProductCode: lab.marketplaceProductCode,
        },
        { status: 409 }
      );
    }

    const accessMode = parsed.data.accessMode || lab.defaultAccessMode;
    if (!lab.accessModes.includes(accessMode)) {
      return NextResponse.json(
        { error: `${lab.shortName} does not support ${accessMode} access` },
        { status: 400 }
      );
    }
    if (accessMode === 'desktop' && !lab.desktopInstanceType) {
      return NextResponse.json(
        {
          error: `${lab.shortName} desktop access is not configured on this deployment`,
          code: 'DESKTOP_PROFILE_UNAVAILABLE',
        },
        { status: 409 }
      );
    }

    const provisionLab = accessMode === 'desktop'
      ? { ...lab, recommendedInstanceType: lab.desktopInstanceType! }
      : lab;

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
      return NextResponse.json({ error: 'One active cloud lab is allowed per account at a time. Stop or destroy the current lab first.' }, { status: 409 });
    }

    const costLimit = await checkRateLimit(
      req,
      RATE_LIMITS.LAB_PROVISION,
      user.id,
      'lab-provision'
    );
    if (costLimit) return costLimit;

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
      [
        lab.slug,
        lab.name,
        lab.category,
        lab.description,
        lab.difficulty,
        lab.runtime,
        JSON.stringify({
          objectives: lab.objectives,
          osFamily: lab.osFamily,
          platform: lab.platform,
          shell: lab.shell,
          accessModes: lab.accessModes,
          defaultAccessMode: lab.defaultAccessMode,
          recommendedInstanceType: lab.recommendedInstanceType,
          desktopInstanceType: lab.desktopInstanceType,
        }),
      ]
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
      const provisioned = await createLabVm(instanceId, user.id, expiresAt, provisionLab);
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
          JSON.stringify({
            region: provisioned.region,
            imageId: provisioned.imageId,
            instanceType: provisioned.instanceType,
            osFamily: provisioned.osFamily,
            platform: provisioned.platform,
            shell: lab.shell,
            accessMode,
          }),
          instanceId,
        ]
      );

      await pool.query(
        `INSERT INTO lab_events (lab_instance_id,event_type,payload)
         VALUES ($1,'provisioned',$2)`,
        [
          instanceId,
          JSON.stringify({
            provider: 'aws-ec2',
            externalId: provisioned.externalId,
            osFamily: provisioned.osFamily,
            imageId: provisioned.imageId,
            accessMode,
          }),
        ]
      );

      await logAudit({
        userId: user.id,
        action: AUDIT_ACTIONS.LAB_CREATE,
        resourceType: 'lab',
        resourceId: instanceId,
        ...getRequestMetadata(req),
        metadata: { definition: lab.slug, provider: 'aws-ec2', osFamily: lab.osFamily, accessMode },
      });

      await captureProductEvent({
        distinctId: user.clerkUserId || user.id,
        event: 'cloud_lab_created',
        properties: {
          lab_slug: lab.slug,
          os_family: lab.osFamily,
          platform: lab.platform,
          access_mode: accessMode,
          ttl_minutes: LAB_TTL_MINUTES,
        },
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
      return NextResponse.json({ error: message, instanceId }, { status: 500 });
    }
  });
}
