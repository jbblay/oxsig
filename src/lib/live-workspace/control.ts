import 'server-only';

import type { Pool, PoolClient } from 'pg';
import {
  capabilitiesForLiveWorkspaceRole,
  LiveWorkspaceError,
  type LiveWorkspaceRole,
} from '@/lib/live-workspace/server';

export type LiveWorkspaceControlSurface = 'terminal' | 'desktop';
export type LiveWorkspaceControlRequestStatus = 'pending' | 'approved' | 'denied' | 'cancelled';
export type LiveWorkspaceControlLeaseStatus = 'active' | 'revoked' | 'expired';

export const CONTROL_LEASE_MINUTES = { min: 5, max: 60, default: 15 } as const;

type Queryable = Pick<Pool | PoolClient, 'query'>;

type ControlAccess = {
  ownerId: string;
  role: LiveWorkspaceRole;
  isOwner: boolean;
  requestControl: boolean;
  grantControl: boolean;
  eligibleForTerminalControl: boolean;
  eligibleForDesktopControl: boolean;
};

type LabBinding = {
  bindingId: string;
  labInstanceId: string;
  labLabel: string;
  accessMode: LiveWorkspaceControlSurface;
};

function normalizeRole(value: unknown, isOwner: boolean): LiveWorkspaceRole {
  if (isOwner) return 'owner';
  if (value === 'instructor' || value === 'learner' || value === 'observer') return value;
  return 'observer';
}

async function getControlAccess(
  queryable: Queryable,
  collaborationId: string,
  userId: string
): Promise<ControlAccess | null> {
  const result = await queryable.query(
    `SELECT c.owner_id,
            CASE WHEN c.owner_id = $2 THEN true ELSE false END AS is_owner,
            lwp.role AS live_role
     FROM collaborations c
     JOIN live_workspaces lw ON lw.collaboration_id = c.id
     LEFT JOIN collaboration_members cm
       ON cm.collaboration_id = c.id AND cm.user_id = $2
     LEFT JOIN live_workspace_participants lwp
       ON lwp.collaboration_id = c.id AND lwp.user_id = $2 AND lwp.status = 'active'
     WHERE c.id = $1
       AND c.collaboration_type = 'live-workspace'
       AND c.status = 'active'
       AND lw.status = 'active'
       AND (lw.expires_at IS NULL OR lw.expires_at > NOW())
       AND (c.owner_id = $2 OR cm.status = 'active')
     LIMIT 1`,
    [collaborationId, userId]
  );
  const row = result.rows[0];
  if (!row) return null;
  const isOwner = Boolean(row.is_owner);
  const role = normalizeRole(row.live_role, isOwner);
  const capabilities = capabilitiesForLiveWorkspaceRole(role);
  return {
    ownerId: row.owner_id,
    role,
    isOwner,
    requestControl: capabilities.requestControl,
    grantControl: capabilities.grantControl,
    eligibleForTerminalControl: capabilities.eligibleForTerminalControl,
    eligibleForDesktopControl: capabilities.eligibleForDesktopControl,
  };
}

function assertSurfaceEligibility(access: ControlAccess, surface: LiveWorkspaceControlSurface) {
  if (!access.requestControl) {
    throw new LiveWorkspaceError('Your Live Workspace role cannot request machine control.', 403, 'CONTROL_REQUEST_DENIED');
  }
  if (surface === 'terminal' && !access.eligibleForTerminalControl) {
    throw new LiveWorkspaceError('Your Live Workspace role is not eligible for terminal control.', 403, 'TERMINAL_CONTROL_INELIGIBLE');
  }
  if (surface === 'desktop' && !access.eligibleForDesktopControl) {
    throw new LiveWorkspaceError('Your Live Workspace role is not eligible for desktop control.', 403, 'DESKTOP_CONTROL_INELIGIBLE');
  }
}

async function getAttachedLabBinding(
  queryable: Queryable,
  collaborationId: string,
  bindingId: string,
  { lock = false }: { lock?: boolean } = {}
): Promise<LabBinding> {
  const result = await queryable.query(
    `SELECT lwr.id AS binding_id,
            lwr.resource_id AS lab_instance_id,
            lwr.resource_owner_id,
            li.owner_id AS lab_owner_id,
            COALESCE(lwr.metadata->>'label', ld.name, ld.slug, 'Cyber Lab') AS lab_label,
            CASE WHEN li.metadata->>'accessMode' = 'desktop' THEN 'desktop' ELSE 'terminal' END AS access_mode
     FROM live_workspace_resources lwr
     JOIN lab_instances li ON li.id = lwr.resource_id
     JOIN lab_definitions ld ON ld.id = li.definition_id
     WHERE lwr.id = $1
       AND lwr.collaboration_id = $2
       AND lwr.resource_type = 'lab-instance'
       AND lwr.status = 'attached'
       AND li.status NOT IN ('destroying','destroyed','failed')
     LIMIT 1${lock ? ' FOR UPDATE OF lwr' : ''}`,
    [bindingId, collaborationId]
  );
  const row = result.rows[0];
  if (!row) {
    throw new LiveWorkspaceError('The attached lab is unavailable for control.', 404, 'CONTROL_LAB_BINDING_NOT_FOUND');
  }
  if (row.resource_owner_id !== row.lab_owner_id) {
    throw new LiveWorkspaceError('The attached lab no longer belongs to its contributing participant.', 403, 'CONTROL_LAB_OWNERSHIP_MISMATCH');
  }
  return {
    bindingId: row.binding_id,
    labInstanceId: row.lab_instance_id,
    labLabel: row.lab_label,
    accessMode: row.access_mode,
  };
}

async function expireStaleLeases(queryable: Queryable, collaborationId: string) {
  await queryable.query(
    `UPDATE live_workspace_control_leases
     SET status='expired', updated_at=NOW()
     WHERE collaboration_id=$1 AND status='active' AND expires_at <= NOW()`,
    [collaborationId]
  );
}

function mapRequest(row: Record<string, any>) {
  return {
    id: row.id as string,
    participantId: row.participant_id as string,
    participantName: row.participant_name || 'Participant',
    bindingId: row.resource_binding_id as string,
    labInstanceId: row.lab_instance_id as string,
    labLabel: row.lab_label || 'Cyber Lab',
    surface: row.surface as LiveWorkspaceControlSurface,
    status: row.status as LiveWorkspaceControlRequestStatus,
    requestedAt: row.requested_at,
    decidedAt: row.decided_at || null,
    decidedBy: row.decided_by || null,
  };
}

function mapLease(row: Record<string, any>) {
  return {
    id: row.id as string,
    requestId: row.request_id as string,
    participantId: row.participant_id as string,
    participantName: row.participant_name || 'Participant',
    bindingId: row.resource_binding_id as string,
    labInstanceId: row.lab_instance_id as string,
    labLabel: row.lab_label || 'Cyber Lab',
    surface: row.surface as LiveWorkspaceControlSurface,
    grantedBy: row.granted_by as string,
    status: row.status as LiveWorkspaceControlLeaseStatus,
    grantedAt: row.granted_at,
    expiresAt: row.expires_at,
    revokedAt: row.revoked_at || null,
    revokedBy: row.revoked_by || null,
    revocationReason: row.revocation_reason || null,
  };
}

export async function createControlRequest(args: {
  pool: Pool;
  collaborationId: string;
  participantId: string;
  bindingId: string;
  surface: LiveWorkspaceControlSurface;
}) {
  const access = await getControlAccess(args.pool, args.collaborationId, args.participantId);
  if (!access) throw new LiveWorkspaceError('Live Workspace not found or access denied.', 404, 'WORKSPACE_NOT_FOUND');
  assertSurfaceEligibility(access, args.surface);

  const binding = await getAttachedLabBinding(args.pool, args.collaborationId, args.bindingId);
  if (binding.accessMode !== args.surface) {
    throw new LiveWorkspaceError(
      `This lab was provisioned for ${binding.accessMode} access, not ${args.surface} control.`,
      409,
      'CONTROL_SURFACE_UNAVAILABLE'
    );
  }

  await expireStaleLeases(args.pool, args.collaborationId);
  const active = await args.pool.query(
    `SELECT 1 FROM live_workspace_control_leases
     WHERE collaboration_id=$1 AND participant_id=$2 AND resource_binding_id=$3
       AND surface=$4 AND status='active' AND expires_at > NOW()
     LIMIT 1`,
    [args.collaborationId, args.participantId, args.bindingId, args.surface]
  );
  if (active.rowCount) {
    throw new LiveWorkspaceError('You already hold an active control lease for this surface.', 409, 'CONTROL_LEASE_ALREADY_ACTIVE');
  }

  try {
    const result = await args.pool.query(
      `INSERT INTO live_workspace_control_requests (
         collaboration_id, participant_id, resource_binding_id, lab_instance_id, surface, status
       ) VALUES ($1,$2,$3,$4,$5,'pending')
       RETURNING id, participant_id, resource_binding_id, lab_instance_id, surface, status,
                 requested_at, decided_at, decided_by`,
      [args.collaborationId, args.participantId, binding.bindingId, binding.labInstanceId, args.surface]
    );
    return mapRequest({ ...result.rows[0], participant_name: 'You', lab_label: binding.labLabel });
  } catch (error: any) {
    if (error?.code === '23505') {
      throw new LiveWorkspaceError('A control request for this lab surface is already pending.', 409, 'CONTROL_REQUEST_ALREADY_PENDING');
    }
    throw error;
  }
}

export async function listControlState(args: {
  pool: Pool;
  collaborationId: string;
  viewerId: string;
}) {
  const access = await getControlAccess(args.pool, args.collaborationId, args.viewerId);
  if (!access) throw new LiveWorkspaceError('Live Workspace not found or access denied.', 404, 'WORKSPACE_NOT_FOUND');
  await expireStaleLeases(args.pool, args.collaborationId);

  const [requests, leases] = await Promise.all([
    args.pool.query(
      `SELECT request.id, request.participant_id, request.resource_binding_id, request.lab_instance_id,
              request.surface, request.status, request.requested_at, request.decided_at, request.decided_by,
              COALESCE(u.display_name, split_part(u.email,'@',1), 'Participant') AS participant_name,
              COALESCE(resource.metadata->>'label', 'Cyber Lab') AS lab_label
       FROM live_workspace_control_requests request
       JOIN users u ON u.id = request.participant_id
       JOIN live_workspace_resources resource ON resource.id = request.resource_binding_id
       WHERE request.collaboration_id=$1
         AND ($3::boolean OR request.participant_id=$2)
       ORDER BY request.requested_at DESC
       LIMIT 50`,
      [args.collaborationId, args.viewerId, access.grantControl]
    ),
    args.pool.query(
      `SELECT lease.id, lease.request_id, lease.participant_id, lease.resource_binding_id,
              lease.lab_instance_id, lease.surface, lease.granted_by, lease.status,
              lease.granted_at, lease.expires_at, lease.revoked_at, lease.revoked_by, lease.revocation_reason,
              COALESCE(u.display_name, split_part(u.email,'@',1), 'Participant') AS participant_name,
              COALESCE(resource.metadata->>'label', 'Cyber Lab') AS lab_label
       FROM live_workspace_control_leases lease
       JOIN users u ON u.id = lease.participant_id
       JOIN live_workspace_resources resource ON resource.id = lease.resource_binding_id
       WHERE lease.collaboration_id=$1
         AND lease.status='active'
         AND lease.expires_at > NOW()
       ORDER BY lease.expires_at ASC`,
      [args.collaborationId]
    ),
  ]);

  return {
    requests: requests.rows.map(mapRequest),
    leases: leases.rows.map(mapLease),
  };
}

export async function approveControlRequest(args: {
  pool: Pool;
  collaborationId: string;
  requestId: string;
  grantorId: string;
  durationMinutes: number;
}) {
  if (!Number.isInteger(args.durationMinutes) || args.durationMinutes < CONTROL_LEASE_MINUTES.min || args.durationMinutes > CONTROL_LEASE_MINUTES.max) {
    throw new LiveWorkspaceError(
      `Control leases must last between ${CONTROL_LEASE_MINUTES.min} and ${CONTROL_LEASE_MINUTES.max} minutes.`,
      400,
      'CONTROL_LEASE_DURATION_INVALID'
    );
  }

  const client = await args.pool.connect();
  try {
    await client.query('BEGIN');
    const requestResult = await client.query(
      `SELECT id, participant_id, resource_binding_id, lab_instance_id, surface, status
       FROM live_workspace_control_requests
       WHERE id=$1 AND collaboration_id=$2
       FOR UPDATE`,
      [args.requestId, args.collaborationId]
    );
    const request = requestResult.rows[0];
    if (!request) throw new LiveWorkspaceError('Control request not found.', 404, 'CONTROL_REQUEST_NOT_FOUND');
    if (request.status !== 'pending') throw new LiveWorkspaceError('This control request has already been decided.', 409, 'CONTROL_REQUEST_ALREADY_DECIDED');

    const grantor = await getControlAccess(client, args.collaborationId, args.grantorId);
    if (!grantor || !grantor.grantControl) {
      throw new LiveWorkspaceError('Your Live Workspace role cannot grant machine control.', 403, 'CONTROL_GRANT_DENIED');
    }
    if (request.participant_id === args.grantorId) {
      throw new LiveWorkspaceError('A control request cannot be self-approved.', 403, 'CONTROL_SELF_GRANT_DENIED');
    }

    const participant = await getControlAccess(client, args.collaborationId, request.participant_id);
    if (!participant) throw new LiveWorkspaceError('The requesting participant is no longer active in this workspace.', 409, 'CONTROL_PARTICIPANT_INACTIVE');
    assertSurfaceEligibility(participant, request.surface);

    const binding = await getAttachedLabBinding(client, args.collaborationId, request.resource_binding_id, { lock: true });
    if (binding.labInstanceId !== request.lab_instance_id || binding.accessMode !== request.surface) {
      throw new LiveWorkspaceError('The requested lab surface is no longer the same attached control target.', 409, 'CONTROL_BINDING_CHANGED');
    }

    await expireStaleLeases(client, args.collaborationId);
    const occupied = await client.query(
      `SELECT id FROM live_workspace_control_leases
       WHERE collaboration_id=$1 AND resource_binding_id=$2 AND surface=$3
         AND status='active' AND expires_at > NOW()
       LIMIT 1`,
      [args.collaborationId, request.resource_binding_id, request.surface]
    );
    if (occupied.rowCount) {
      throw new LiveWorkspaceError('This lab surface already has an active controller.', 409, 'CONTROL_SURFACE_BUSY');
    }

    const leaseResult = await client.query(
      `INSERT INTO live_workspace_control_leases (
         request_id, collaboration_id, participant_id, resource_binding_id, lab_instance_id,
         surface, granted_by, status, expires_at
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,'active',LEAST(
         NOW() + ($8 * INTERVAL '1 minute'),
         -- Time-limited rooms (Rescue Rooms) never grant control past their end.
         (SELECT COALESCE(room.expires_at, 'infinity'::timestamptz) FROM live_workspaces room WHERE room.collaboration_id=$2)
       ))
       RETURNING id, request_id, participant_id, resource_binding_id, lab_instance_id, surface,
                 granted_by, status, granted_at, expires_at, revoked_at, revoked_by, revocation_reason`,
      [args.requestId, args.collaborationId, request.participant_id, request.resource_binding_id,
        request.lab_instance_id, request.surface, args.grantorId, args.durationMinutes]
    );

    await client.query(
      `UPDATE live_workspace_control_requests
       SET status='approved', decided_at=NOW(), decided_by=$3, updated_at=NOW()
       WHERE id=$1 AND collaboration_id=$2`,
      [args.requestId, args.collaborationId, args.grantorId]
    );
    await client.query('COMMIT');
    return mapLease({ ...leaseResult.rows[0], participant_name: 'Participant', lab_label: binding.labLabel });
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

export async function denyControlRequest(args: {
  pool: Pool;
  collaborationId: string;
  requestId: string;
  grantorId: string;
}) {
  const client = await args.pool.connect();
  try {
    await client.query('BEGIN');
    const requestResult = await client.query(
      `SELECT id, participant_id, status
       FROM live_workspace_control_requests
       WHERE id=$1 AND collaboration_id=$2
       FOR UPDATE`,
      [args.requestId, args.collaborationId]
    );
    const request = requestResult.rows[0];
    if (!request) throw new LiveWorkspaceError('Control request not found.', 404, 'CONTROL_REQUEST_NOT_FOUND');
    if (request.status !== 'pending') throw new LiveWorkspaceError('This control request has already been decided.', 409, 'CONTROL_REQUEST_ALREADY_DECIDED');

    const grantor = await getControlAccess(client, args.collaborationId, args.grantorId);
    if (!grantor || !grantor.grantControl) {
      throw new LiveWorkspaceError('Your Live Workspace role cannot deny control requests.', 403, 'CONTROL_GRANT_DENIED');
    }

    await client.query(
      `UPDATE live_workspace_control_requests
       SET status='denied', decided_at=NOW(), decided_by=$3, updated_at=NOW()
       WHERE id=$1 AND collaboration_id=$2`,
      [args.requestId, args.collaborationId, args.grantorId]
    );
    await client.query('COMMIT');
    return { denied: true, requestId: args.requestId };
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

export async function revokeControlLease(args: {
  pool: Pool;
  collaborationId: string;
  leaseId: string;
  actorId: string;
}) {
  const client = await args.pool.connect();
  try {
    await client.query('BEGIN');
    const leaseResult = await client.query(
      `SELECT id, participant_id, status, expires_at
       FROM live_workspace_control_leases
       WHERE id=$1 AND collaboration_id=$2
       FOR UPDATE`,
      [args.leaseId, args.collaborationId]
    );
    const lease = leaseResult.rows[0];
    if (!lease) throw new LiveWorkspaceError('Control lease not found.', 404, 'CONTROL_LEASE_NOT_FOUND');

    if (lease.status === 'active' && new Date(lease.expires_at).getTime() <= Date.now()) {
      await client.query(
        `UPDATE live_workspace_control_leases SET status='expired', updated_at=NOW() WHERE id=$1`,
        [args.leaseId]
      );
      await client.query('COMMIT');
      return { revoked: false, expired: true, leaseId: args.leaseId };
    }
    if (lease.status !== 'active') {
      throw new LiveWorkspaceError('This control lease is no longer active.', 409, 'CONTROL_LEASE_INACTIVE');
    }

    const actor = await getControlAccess(client, args.collaborationId, args.actorId);
    if (!actor) throw new LiveWorkspaceError('Live Workspace not found or access denied.', 404, 'WORKSPACE_NOT_FOUND');
    if (!actor.grantControl && lease.participant_id !== args.actorId) {
      throw new LiveWorkspaceError('You cannot revoke this control lease.', 403, 'CONTROL_REVOKE_DENIED');
    }

    await client.query(
      `UPDATE live_workspace_control_leases
       SET status='revoked', revoked_at=NOW(), revoked_by=$2,
           revocation_reason=$3, updated_at=NOW()
       WHERE id=$1`,
      [args.leaseId, args.actorId, lease.participant_id === args.actorId ? 'participant_released' : 'grantor_revoked']
    );
    await client.query('COMMIT');
    return { revoked: true, expired: false, leaseId: args.leaseId };
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

export async function revokeControlForBinding(args: {
  queryable: Queryable;
  collaborationId: string;
  bindingId: string;
  actorId: string;
  reason?: string;
}) {
  await args.queryable.query(
    `UPDATE live_workspace_control_leases
     SET status='revoked', revoked_at=NOW(), revoked_by=$3,
         revocation_reason=$4, updated_at=NOW()
     WHERE collaboration_id=$1 AND resource_binding_id=$2 AND status='active'`,
    [args.collaborationId, args.bindingId, args.actorId, args.reason || 'resource_detached']
  );
  await args.queryable.query(
    `UPDATE live_workspace_control_requests
     SET status='cancelled', decided_at=NOW(), decided_by=$3, updated_at=NOW()
     WHERE collaboration_id=$1 AND resource_binding_id=$2 AND status='pending'`,
    [args.collaborationId, args.bindingId, args.actorId]
  );
}

export async function revokeControlForParticipant(args: {
  queryable: Queryable;
  collaborationId: string;
  participantId: string;
  actorId: string;
  reason?: string;
}) {
  await args.queryable.query(
    `UPDATE live_workspace_control_leases
     SET status='revoked', revoked_at=NOW(), revoked_by=$3,
         revocation_reason=$4, updated_at=NOW()
     WHERE collaboration_id=$1 AND participant_id=$2 AND status='active'`,
    [args.collaborationId, args.participantId, args.actorId, args.reason || 'participant_ineligible']
  );
  await args.queryable.query(
    `UPDATE live_workspace_control_requests
     SET status='cancelled', decided_at=NOW(), decided_by=$3, updated_at=NOW()
     WHERE collaboration_id=$1 AND participant_id=$2 AND status='pending'`,
    [args.collaborationId, args.participantId, args.actorId]
  );
}

/**
 * Future terminal/desktop transports must call this (or an equivalent server-side
 * authorization primitive) immediately before accepting shared input. A client
 * supplied lease id is never sufficient authorization by itself.
 */
export async function getActiveControlLease(args: {
  queryable: Queryable;
  collaborationId: string;
  participantId: string;
  bindingId: string;
  surface: LiveWorkspaceControlSurface;
}) {
  const result = await args.queryable.query(
    `SELECT lease.id, lease.request_id, lease.participant_id, lease.resource_binding_id,
            lease.lab_instance_id, lease.surface, lease.granted_by, lease.status,
            lease.granted_at, lease.expires_at, lease.revoked_at, lease.revoked_by, lease.revocation_reason,
            COALESCE(u.display_name, split_part(u.email,'@',1), 'Participant') AS participant_name,
            COALESCE(resource.metadata->>'label', 'Cyber Lab') AS lab_label
     FROM live_workspace_control_leases lease
     JOIN live_workspaces workspace ON workspace.collaboration_id = lease.collaboration_id AND workspace.status='active'
      AND (workspace.expires_at IS NULL OR workspace.expires_at > NOW())
     JOIN collaborations c ON c.id = lease.collaboration_id AND c.status='active' AND c.collaboration_type='live-workspace'
     JOIN live_workspace_resources resource
       ON resource.id = lease.resource_binding_id
      AND resource.collaboration_id = lease.collaboration_id
      AND resource.resource_type='lab-instance'
      AND resource.status='attached'
     JOIN lab_instances lab
       ON lab.id = lease.lab_instance_id
      AND lab.id = resource.resource_id
      AND resource.resource_owner_id = lab.owner_id
      AND lab.status NOT IN ('destroying','destroyed','failed')
     JOIN users u ON u.id = lease.participant_id
     LEFT JOIN collaboration_members cm
       ON cm.collaboration_id = lease.collaboration_id AND cm.user_id = lease.participant_id AND cm.status='active'
     LEFT JOIN live_workspace_participants participant
       ON participant.collaboration_id = lease.collaboration_id
      AND participant.user_id = lease.participant_id
      AND participant.status='active'
     LEFT JOIN collaboration_members resource_owner_member
       ON resource_owner_member.collaboration_id = lease.collaboration_id
      AND resource_owner_member.user_id = resource.resource_owner_id
      AND resource_owner_member.status='active'
     LEFT JOIN live_workspace_participants resource_owner_participant
       ON resource_owner_participant.collaboration_id = lease.collaboration_id
      AND resource_owner_participant.user_id = resource.resource_owner_id
      AND resource_owner_participant.status='active'
     WHERE lease.collaboration_id=$1
       AND lease.participant_id=$2
       AND lease.resource_binding_id=$3
       AND lease.surface=$4
       AND lease.status='active'
       AND lease.expires_at > NOW()
       AND (c.owner_id = lease.participant_id OR cm.user_id IS NOT NULL)
       AND (c.owner_id = lease.participant_id OR participant.role IN ('instructor','learner'))
       AND (c.owner_id = resource.resource_owner_id OR resource_owner_member.user_id IS NOT NULL)
       AND (c.owner_id = resource.resource_owner_id OR resource_owner_participant.role IN ('instructor','learner'))
       AND (CASE WHEN lab.metadata->>'accessMode' = 'desktop' THEN 'desktop' ELSE 'terminal' END) = lease.surface
     LIMIT 1`,
    [args.collaborationId, args.participantId, args.bindingId, args.surface]
  );
  return result.rows[0] ? mapLease(result.rows[0]) : null;
}
