import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAuth } from '@/lib/auth/middleware';
import { getPool } from '@/lib/db/pool';
import { stringifyPostgresJson } from '@/lib/db/postgres-safe';
import { getOperation } from '@/lib/operations/catalog';
import { getOperationRun } from '@/lib/operations/runtime';
import { validateCsrfToken } from '@/lib/security/csrf';
import { checkRateLimit } from '@/lib/security/rate-limit';

export const runtime = 'nodejs';

const idSchema = z.string().uuid();
const PRIVATE_HEADERS = { 'Cache-Control': 'private, no-store, max-age=0', Pragma: 'no-cache' };

type LinkedRun = {
  owner_id: string;
  operation_slug: string;
  mode: string;
  status: string;
  workspace_id: string | null;
};

async function findAccessibleLink(runId: string, viewerId: string): Promise<LinkedRun | null> {
  const result = await getPool().query(
    `SELECT run.owner_id,
            run.operation_slug,
            run.mode,
            run.status,
            CASE WHEN lw.collaboration_id IS NOT NULL THEN c.id ELSE NULL END AS workspace_id
       FROM operation_runs run
       LEFT JOIN collaborations c
         ON c.owner_id = run.owner_id
        AND c.collaboration_type = 'live-workspace'
        AND c.status = 'active'
        AND c.settings->'operation'->>'runId' = run.id::text
       LEFT JOIN live_workspaces lw
         ON lw.collaboration_id = c.id
        AND lw.status = 'active'
       LEFT JOIN collaboration_members cm
         ON cm.collaboration_id = c.id
        AND cm.user_id = $2
        AND cm.status = 'active'
      WHERE run.id = $1
        AND (
          run.owner_id = $2
          OR (lw.collaboration_id IS NOT NULL AND (c.owner_id = $2 OR cm.user_id = $2))
        )
      ORDER BY c.updated_at DESC NULLS LAST
      LIMIT 1`,
    [runId, viewerId]
  );
  return result.rows[0] || null;
}

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return requireAuth(request, async (_req, user) => {
    const { id } = await params;
    if (!idSchema.safeParse(id).success) {
      return NextResponse.json({ error: 'Invalid WarRoom Operation run' }, { status: 400, headers: PRIVATE_HEADERS });
    }

    try {
      const linked = await findAccessibleLink(id, user.id);
      if (!linked) {
        return NextResponse.json({ error: 'WarRoom Operation not found or access denied' }, { status: 404, headers: PRIVATE_HEADERS });
      }
      if (linked.mode !== 'warroom') {
        return NextResponse.json({ error: 'This Operation was not launched in WarRoom mode' }, { status: 409, headers: PRIVATE_HEADERS });
      }

      const run = await getOperationRun({ pool: getPool(), runId: id, ownerId: linked.owner_id });
      return NextResponse.json({
        workspaceId: linked.workspace_id,
        canCreateWorkspace: linked.owner_id === user.id && !linked.workspace_id,
        run,
      }, { headers: PRIVATE_HEADERS });
    } catch (error) {
      console.error('WarRoom context load failed:', error);
      return NextResponse.json({ error: 'Could not load WarRoom context' }, { status: 500, headers: PRIVATE_HEADERS });
    }
  });
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return requireAuth(request, async (req, user) => {
    if (!(await validateCsrfToken(req))) {
      return NextResponse.json({ error: 'Invalid or missing CSRF token' }, { status: 403, headers: PRIVATE_HEADERS });
    }
    const rateLimit = await checkRateLimit(req, { maxRequests: 12, windowMs: 60 * 60_000 }, `${user.id}:warroom-workspace`);
    if (rateLimit) return rateLimit;

    const { id } = await params;
    if (!idSchema.safeParse(id).success) {
      return NextResponse.json({ error: 'Invalid WarRoom Operation run' }, { status: 400, headers: PRIVATE_HEADERS });
    }

    const pool = getPool();
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const locked = await client.query(
        `SELECT id,operation_slug,mode,status,expires_at,operator_lab_instance_id
           FROM operation_runs
          WHERE id=$1 AND owner_id=$2
          FOR UPDATE`,
        [id, user.id]
      );
      const run = locked.rows[0];
      if (!run) {
        await client.query('ROLLBACK');
        return NextResponse.json({ error: 'WarRoom Operation not found or owner access required' }, { status: 404, headers: PRIVATE_HEADERS });
      }
      if (run.mode !== 'warroom') {
        await client.query('ROLLBACK');
        return NextResponse.json({ error: 'This Operation was not launched in WarRoom mode' }, { status: 409, headers: PRIVATE_HEADERS });
      }
      if (['destroying', 'destroyed', 'failed'].includes(run.status) || new Date(run.expires_at).getTime() <= Date.now()) {
        await client.query('ROLLBACK');
        return NextResponse.json({ error: 'This Operation is no longer available for team collaboration' }, { status: 409, headers: PRIVATE_HEADERS });
      }

      const attachOperatorLab = async (workspaceId: string) => {
        if (!run.operator_lab_instance_id) return;
        const resource = await client.query(
          `SELECT li.id,COALESCE(ld.name,ld.slug,'Cyber Lab') AS label
             FROM lab_instances li
             JOIN lab_definitions ld ON ld.id=li.definition_id
            WHERE li.id=$1 AND li.owner_id=$2
              AND li.status NOT IN ('destroying','destroyed','failed')
            LIMIT 1`,
          [run.operator_lab_instance_id, user.id]
        );
        if (!resource.rows[0]) return;
        await client.query(
          `INSERT INTO live_workspace_resources (
             collaboration_id,resource_type,resource_id,resource_owner_id,attached_by,status,metadata
           ) VALUES ($1,'lab-instance',$2,$3,$3,'attached',$4::jsonb)
           ON CONFLICT (collaboration_id,resource_type,resource_id)
           DO UPDATE SET status='attached',detached_at=NULL,attached_by=EXCLUDED.attached_by,
                         resource_owner_id=EXCLUDED.resource_owner_id,metadata=EXCLUDED.metadata,updated_at=NOW()`,
          [workspaceId, resource.rows[0].id, user.id, stringifyPostgresJson({ label: `${resource.rows[0].label} · Operation operator` })]
        );
      };

      const existing = await client.query(
        `SELECT c.id
           FROM collaborations c
           JOIN live_workspaces lw ON lw.collaboration_id=c.id AND lw.status='active'
          WHERE c.owner_id=$1
            AND c.collaboration_type='live-workspace'
            AND c.status='active'
            AND c.settings->'operation'->>'runId'=$2
          ORDER BY c.updated_at DESC
          LIMIT 1`,
        [user.id, id]
      );
      if (existing.rows[0]) {
        await attachOperatorLab(existing.rows[0].id);
        await client.query('COMMIT');
        return NextResponse.json({ workspaceId: existing.rows[0].id, created: false }, { headers: PRIVATE_HEADERS });
      }

      const operation = getOperation(run.operation_slug);
      const created = await client.query(
        `INSERT INTO collaborations (name,description,owner_id,status,collaboration_type,settings)
         VALUES ($1,$2,$3,'active','live-workspace',$4::jsonb)
         RETURNING id`,
        [
          `${operation?.codename || 'WarRoom'} · Team`,
          `Team workspace for ${operation?.name || run.operation_slug}.`,
          user.id,
          stringifyPostgresJson({
            liveWorkspaceVersion: 1,
            warRoomVersion: 1,
            operation: { runId: id, slug: run.operation_slug, mode: 'warroom' },
          }),
        ]
      );
      const workspaceId = created.rows[0].id as string;

      await client.query(
        `INSERT INTO collaboration_members (collaboration_id,user_id,role,permissions,status,invited_by)
         VALUES ($1,$2,'owner',$3::jsonb,'active',$2)
         ON CONFLICT (collaboration_id,user_id)
         DO UPDATE SET role='owner',permissions=EXCLUDED.permissions,status='active'`,
        [workspaceId, user.id, stringifyPostgresJson({ read: true, write: true, admin: true })]
      );
      await client.query(
        `INSERT INTO live_workspaces (collaboration_id,created_by,status)
         VALUES ($1,$2,'active')`,
        [workspaceId, user.id]
      );
      await client.query(
        `INSERT INTO live_workspace_participants (collaboration_id,user_id,role,status,assigned_by)
         VALUES ($1,$2,'owner','active',$2)
         ON CONFLICT (collaboration_id,user_id)
         DO UPDATE SET role='owner',status='active',assigned_by=EXCLUDED.assigned_by,updated_at=NOW()`,
        [workspaceId, user.id]
      );
      await attachOperatorLab(workspaceId);

      await client.query('COMMIT');
      return NextResponse.json({ workspaceId, created: true }, { status: 201, headers: PRIVATE_HEADERS });
    } catch (error) {
      await client.query('ROLLBACK').catch(() => undefined);
      console.error('WarRoom workspace link failed:', error);
      return NextResponse.json({ error: 'Could not link the WarRoom collaboration workspace' }, { status: 500, headers: PRIVATE_HEADERS });
    } finally {
      client.release();
    }
  });
}
