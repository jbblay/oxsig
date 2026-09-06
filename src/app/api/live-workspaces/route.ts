import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAuth } from '@/lib/auth/middleware';
import { getPool } from '@/lib/db/pool';
import { validateCsrfToken } from '@/lib/security/csrf';
import { checkRateLimit } from '@/lib/security/rate-limit';
import { capabilitiesForLiveWorkspaceRole, type LiveWorkspaceRole } from '@/lib/live-workspace/server';

export const runtime = 'nodejs';

const createSchema = z.object({
  name: z.string().trim().min(1).max(80),
  description: z.string().trim().max(500).optional(),
}).strict();

export async function GET(request: NextRequest) {
  return requireAuth(request, async (_req, user) => {
    try {
      const result = await getPool().query(
        `SELECT c.id, c.name, c.description, c.owner_id, c.updated_at,
                CASE
                  WHEN c.owner_id = $1 THEN 'owner'
                  WHEN lwp.role IN ('instructor','learner','observer') THEN lwp.role
                  ELSE 'observer'
                END AS live_role
         FROM collaborations c
         JOIN live_workspaces lw ON lw.collaboration_id = c.id AND lw.status = 'active'
         LEFT JOIN collaboration_members cm
           ON cm.collaboration_id = c.id AND cm.user_id = $1 AND cm.status = 'active'
         LEFT JOIN live_workspace_participants lwp
           ON lwp.collaboration_id = c.id AND lwp.user_id = $1 AND lwp.status = 'active'
         WHERE c.collaboration_type = 'live-workspace'
           AND c.status = 'active'
           AND (c.owner_id = $1 OR cm.user_id = $1)
         ORDER BY c.updated_at DESC
         LIMIT 100`,
        [user.id]
      );
      return NextResponse.json({
        workspaces: result.rows.map((row) => {
          const role = row.live_role as LiveWorkspaceRole;
          return {
            id: row.id,
            name: row.name,
            description: row.description || '',
            ownerId: row.owner_id,
            role,
            isOwner: row.owner_id === user.id,
            capabilities: capabilitiesForLiveWorkspaceRole(role),
            updatedAt: row.updated_at,
          };
        }),
      }, { headers: { 'Cache-Control': 'no-store' } });
    } catch (error) {
      console.error('Live Workspace list failed:', error);
      return NextResponse.json({ error: 'Could not load Live Workspaces' }, { status: 500 });
    }
  });
}

export async function POST(request: NextRequest) {
  return requireAuth(request, async (req, user) => {
    if (!(await validateCsrfToken(req))) {
      return NextResponse.json({ error: 'Invalid or missing CSRF token' }, { status: 403 });
    }
    const rateLimit = await checkRateLimit(req, { maxRequests: 8, windowMs: 60 * 60_000 }, user.id);
    if (rateLimit) return rateLimit;
    const parsed = createSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ error: 'Enter a valid Live Workspace name' }, { status: 400 });

    const pool = getPool();
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const created = await client.query(
        `INSERT INTO collaborations (name, description, owner_id, status, collaboration_type, settings)
         VALUES ($1,$2,$3,'active','live-workspace',$4::jsonb)
         RETURNING id, name, description, owner_id, created_at, updated_at`,
        [parsed.data.name, parsed.data.description || null, user.id, JSON.stringify({ liveWorkspaceVersion: 1 })]
      );
      const row = created.rows[0];
      await client.query(
        `INSERT INTO collaboration_members (collaboration_id, user_id, role, permissions, status, invited_by)
         VALUES ($1,$2,'owner',$3::jsonb,'active',$2)
         ON CONFLICT (collaboration_id, user_id)
         DO UPDATE SET role='owner', permissions=EXCLUDED.permissions, status='active'`,
        [row.id, user.id, JSON.stringify({ read: true, write: true, admin: true })]
      );
      await client.query(
        `INSERT INTO live_workspaces (collaboration_id, created_by, status)
         VALUES ($1,$2,'active')`,
        [row.id, user.id]
      );
      await client.query(
        `INSERT INTO live_workspace_participants (collaboration_id, user_id, role, status, assigned_by)
         VALUES ($1,$2,'owner','active',$2)`,
        [row.id, user.id]
      );
      await client.query('COMMIT');
      return NextResponse.json({
        workspace: {
          id: row.id,
          name: row.name,
          description: row.description || '',
          ownerId: row.owner_id,
          role: 'owner',
          isOwner: true,
          capabilities: capabilitiesForLiveWorkspaceRole('owner'),
          createdAt: row.created_at,
          updatedAt: row.updated_at,
        },
      }, { status: 201, headers: { 'Cache-Control': 'no-store' } });
    } catch (error) {
      await client.query('ROLLBACK').catch(() => undefined);
      console.error('Live Workspace create failed:', error);
      return NextResponse.json({ error: 'Could not create Live Workspace' }, { status: 500 });
    } finally {
      client.release();
    }
  });
}
