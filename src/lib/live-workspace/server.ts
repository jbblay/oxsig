import 'server-only';

import type { Pool, PoolClient } from 'pg';

export type LiveWorkspaceRole = 'owner' | 'instructor' | 'learner' | 'observer';
export type LiveWorkspaceResourceType = 'lab-instance' | 'academy-course' | 'infrastructure-design';

export type LiveWorkspaceCapabilities = {
  observe: boolean;
  collaborate: boolean;
  requestControl: boolean;
  grantControl: boolean;
  manageParticipants: boolean;
  manageResources: boolean;
  eligibleForTerminalControl: boolean;
  eligibleForDesktopControl: boolean;
};

export type LiveWorkspaceAccess = {
  id: string;
  name: string;
  description: string;
  ownerId: string;
  role: LiveWorkspaceRole;
  isOwner: boolean;
  capabilities: LiveWorkspaceCapabilities;
};

export class LiveWorkspaceError extends Error {
  constructor(message: string, public readonly status = 409, public readonly code = 'LIVE_WORKSPACE_CONFLICT') {
    super(message);
    this.name = 'LiveWorkspaceError';
  }
}

export function capabilitiesForLiveWorkspaceRole(role: LiveWorkspaceRole): LiveWorkspaceCapabilities {
  if (role === 'owner') {
    return {
      observe: true,
      collaborate: true,
      requestControl: true,
      grantControl: true,
      manageParticipants: true,
      manageResources: true,
      eligibleForTerminalControl: true,
      eligibleForDesktopControl: true,
    };
  }
  if (role === 'instructor') {
    return {
      observe: true,
      collaborate: true,
      requestControl: true,
      grantControl: true,
      manageParticipants: true,
      manageResources: true,
      eligibleForTerminalControl: true,
      eligibleForDesktopControl: true,
    };
  }
  if (role === 'learner') {
    return {
      observe: true,
      collaborate: true,
      requestControl: true,
      grantControl: false,
      manageParticipants: false,
      manageResources: false,
      eligibleForTerminalControl: true,
      eligibleForDesktopControl: true,
    };
  }
  return {
    observe: true,
    collaborate: false,
    requestControl: false,
    grantControl: false,
    manageParticipants: false,
    manageResources: false,
    eligibleForTerminalControl: false,
    eligibleForDesktopControl: false,
  };
}

function normalizeRole(value: unknown, isOwner: boolean): LiveWorkspaceRole {
  if (isOwner) return 'owner';
  if (value === 'instructor' || value === 'learner' || value === 'observer') return value;
  return 'observer';
}

export async function getLiveWorkspaceAccess(
  pool: Pool,
  collaborationId: string,
  userId: string
): Promise<LiveWorkspaceAccess | null> {
  const result = await pool.query(
    `SELECT c.id,
            c.name,
            c.description,
            c.owner_id,
            CASE WHEN c.owner_id = $2 THEN true ELSE false END AS is_owner,
            lwp.role AS live_role
     FROM collaborations c
     JOIN live_workspaces lw ON lw.collaboration_id = c.id
     LEFT JOIN collaboration_members cm
       ON cm.collaboration_id = c.id
      AND cm.user_id = $2
     LEFT JOIN live_workspace_participants lwp
       ON lwp.collaboration_id = c.id
      AND lwp.user_id = $2
      AND lwp.status = 'active'
     WHERE c.id = $1
       AND c.collaboration_type = 'live-workspace'
       AND c.status = 'active'
       AND lw.status = 'active'
       AND (c.owner_id = $2 OR cm.status = 'active')
     LIMIT 1`,
    [collaborationId, userId]
  );
  const row = result.rows[0];
  if (!row) return null;
  const isOwner = Boolean(row.is_owner);
  const role = normalizeRole(row.live_role, isOwner);
  return {
    id: row.id,
    name: row.name,
    description: row.description || '',
    ownerId: row.owner_id,
    role,
    isOwner,
    capabilities: capabilitiesForLiveWorkspaceRole(role),
  };
}

export async function listLiveWorkspaceParticipants(pool: Pool, collaborationId: string) {
  const result = await pool.query(
    `SELECT participant.id,
            participant.display_name,
            participant.email,
            participant.avatar_url,
            participant.owner_id,
            participant.live_role
     FROM (
       SELECT u.id,
              u.display_name,
              u.email,
              u.avatar_url,
              c.owner_id,
              'owner'::text AS live_role,
              0 AS sort_order
       FROM collaborations c
       JOIN users u ON u.id = c.owner_id
       WHERE c.id = $1
       UNION ALL
       SELECT u.id,
              u.display_name,
              u.email,
              u.avatar_url,
              c.owner_id,
              CASE
                WHEN lwp.role IN ('instructor','learner','observer') THEN lwp.role
                ELSE 'observer'
              END AS live_role,
              1 AS sort_order
       FROM collaborations c
       JOIN collaboration_members cm ON cm.collaboration_id = c.id AND cm.status = 'active'
       JOIN users u ON u.id = cm.user_id
       LEFT JOIN live_workspace_participants lwp
         ON lwp.collaboration_id = c.id AND lwp.user_id = u.id AND lwp.status = 'active'
       WHERE c.id = $1 AND u.id <> c.owner_id
     ) participant
     ORDER BY participant.sort_order, participant.display_name NULLS LAST, participant.email NULLS LAST`,
    [collaborationId]
  );
  return result.rows.map((row) => {
    const role = normalizeRole(row.live_role, row.id === row.owner_id);
    return {
      id: row.id as string,
      displayName: row.display_name || String(row.email || '').split('@')[0] || 'Participant',
      email: row.email || null,
      avatarUrl: row.avatar_url || null,
      role,
      capabilities: capabilitiesForLiveWorkspaceRole(role),
    };
  });
}

export async function assertOwnerResource(
  queryable: Pool | PoolClient,
  ownerId: string,
  resourceType: LiveWorkspaceResourceType,
  resourceId: string
): Promise<{ id: string; label: string }> {
  if (resourceType === 'lab-instance') {
    const result = await queryable.query(
      `SELECT li.id, COALESCE(ld.name, ld.slug, 'Cyber Lab') AS label
       FROM lab_instances li
       JOIN lab_definitions ld ON ld.id = li.definition_id
       WHERE li.id = $1 AND li.owner_id = $2 AND li.status <> 'destroyed'
       LIMIT 1`,
      [resourceId, ownerId]
    );
    if (!result.rows[0]) throw new LiveWorkspaceError('The lab resource is unavailable or not owned by the workspace owner.', 403, 'RESOURCE_OWNERSHIP_MISMATCH');
    return { id: result.rows[0].id, label: result.rows[0].label };
  }
  if (resourceType === 'academy-course') {
    const result = await queryable.query(
      `SELECT id, COALESCE(course_data->>'title', 'Academy course') AS label
       FROM academy_courses
       WHERE id = $1 AND owner_id = $2
       LIMIT 1`,
      [resourceId, ownerId]
    );
    if (!result.rows[0]) throw new LiveWorkspaceError('The Academy course is unavailable or not owned by the workspace owner.', 403, 'RESOURCE_OWNERSHIP_MISMATCH');
    return { id: result.rows[0].id, label: result.rows[0].label };
  }
  const result = await queryable.query(
    `SELECT owner_id AS id, 'Infrastructure design'::text AS label
     FROM infrastructure_designs
     WHERE owner_id = $1 AND owner_id = $2
     LIMIT 1`,
    [resourceId, ownerId]
  );
  if (!result.rows[0]) throw new LiveWorkspaceError('The Infrastructure Design is unavailable or not owned by the workspace owner.', 403, 'RESOURCE_OWNERSHIP_MISMATCH');
  return { id: result.rows[0].id, label: result.rows[0].label };
}

export async function assignLiveWorkspaceRole(args: {
  pool: Pool;
  collaborationId: string;
  actorId: string;
  targetUserId: string;
  role: Exclude<LiveWorkspaceRole, 'owner'>;
}) {
  const access = await getLiveWorkspaceAccess(args.pool, args.collaborationId, args.actorId);
  if (!access) throw new LiveWorkspaceError('Live Workspace not found or access denied.', 404, 'WORKSPACE_NOT_FOUND');
  if (!access.capabilities.manageParticipants) throw new LiveWorkspaceError('You cannot manage Live Workspace participants.', 403, 'PARTICIPANT_MANAGEMENT_DENIED');
  if (args.targetUserId === access.ownerId) throw new LiveWorkspaceError('The workspace owner role cannot be changed.', 409, 'OWNER_ROLE_IMMUTABLE');

  const member = await args.pool.query(
    `SELECT 1 FROM collaboration_members
     WHERE collaboration_id = $1 AND user_id = $2 AND status = 'active'
     LIMIT 1`,
    [args.collaborationId, args.targetUserId]
  );
  if (!member.rowCount) throw new LiveWorkspaceError('The target user is not an active workspace member.', 404, 'PARTICIPANT_NOT_FOUND');

  await args.pool.query(
    `INSERT INTO live_workspace_participants (collaboration_id, user_id, role, status, assigned_by)
     VALUES ($1,$2,$3,'active',$4)
     ON CONFLICT (collaboration_id, user_id)
     DO UPDATE SET role = EXCLUDED.role, status = 'active', assigned_by = EXCLUDED.assigned_by, updated_at = NOW()`,
    [args.collaborationId, args.targetUserId, args.role, args.actorId]
  );
  return { role: args.role, capabilities: capabilitiesForLiveWorkspaceRole(args.role) };
}
