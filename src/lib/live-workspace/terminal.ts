import 'server-only';

import type { Pool } from 'pg';
import { getLabTerminalDiagnostics, type LabTerminalDiagnostics } from '@/lib/labs/terminal-observability';
import { getActiveControlLease } from '@/lib/live-workspace/control';
import { LiveWorkspaceError } from '@/lib/live-workspace/server';

export type LiveWorkspaceTerminalAuthorization = {
  collaborationId: string;
  participantId: string;
  bindingId: string;
  labInstanceId: string;
  leaseId: string;
  surface: 'terminal';
};

type TerminalTargetRow = {
  binding_id: string;
  lab_instance_id: string;
  resource_owner_id: string;
  lab_owner_id: string;
  label: string;
  access_mode: 'terminal' | 'desktop';
  status: string;
  runtime_provider: string;
  runtime_external_id: string | null;
  expires_at: string | Date | null;
  last_error: string | null;
};

export type LiveWorkspaceTerminalTarget = {
  authorization: LiveWorkspaceTerminalAuthorization;
  label: string;
  runtimeExternalId: string;
  diagnostics: LabTerminalDiagnostics;
  leaseExpiresAt: string;
};

async function reconcileObservedState(pool: Pool, row: TerminalTargetRow, diagnostics: LabTerminalDiagnostics) {
  if (row.status === diagnostics.ec2State) return;
  const observedStatus = diagnostics.ec2State;
  const isDestroyed = observedStatus === 'destroyed';
  const isRunning = observedStatus === 'running';
  const isStopped = observedStatus === 'stopped';

  await pool.query(
    `UPDATE lab_instances
     SET status=$1::varchar,
         last_error=CASE WHEN $2::boolean THEN NULL ELSE last_error END,
         started_at=CASE WHEN $3::boolean AND started_at IS NULL THEN NOW() ELSE started_at END,
         stopped_at=CASE WHEN $4::boolean THEN NOW() ELSE stopped_at END,
         updated_at=NOW()
     WHERE id=$5`,
    [observedStatus, isDestroyed, isRunning, isStopped, row.lab_instance_id]
  );
  row.status = observedStatus;
  if (isDestroyed) row.last_error = null;
}

export async function assertLiveWorkspaceTerminalAuthorization(args: {
  pool: Pool;
  authorization: LiveWorkspaceTerminalAuthorization;
}) {
  const authorization = args.authorization;
  if (authorization.surface !== 'terminal') {
    throw new LiveWorkspaceError('Shared terminal authorization requires the terminal surface.', 403, 'TERMINAL_CONTROL_REQUIRED');
  }

  const lease = await getActiveControlLease({
    queryable: args.pool,
    collaborationId: authorization.collaborationId,
    participantId: authorization.participantId,
    bindingId: authorization.bindingId,
    surface: 'terminal',
  });

  if (!lease || lease.id !== authorization.leaseId || lease.labInstanceId !== authorization.labInstanceId) {
    throw new LiveWorkspaceError('The shared terminal control lease is no longer active.', 403, 'TERMINAL_CONTROL_LEASE_INACTIVE');
  }

  const ownership = await args.pool.query(
    `SELECT 1
       FROM live_workspace_resources resource
       JOIN lab_instances lab ON lab.id=resource.resource_id
      WHERE resource.id=$1
        AND resource.collaboration_id=$2
        AND resource.resource_id=$3
        AND resource.resource_type='lab-instance'
        AND resource.status='attached'
        AND resource.resource_owner_id=lab.owner_id
        AND lab.status <> 'destroyed'
        AND (CASE WHEN lab.metadata->>'accessMode'='desktop' THEN 'desktop' ELSE 'terminal' END)='terminal'
      LIMIT 1`,
    [authorization.bindingId, authorization.collaborationId, authorization.labInstanceId]
  );
  if (!ownership.rowCount) {
    throw new LiveWorkspaceError('The shared terminal lab ownership or attachment is no longer valid.', 403, 'TERMINAL_LAB_AUTHORIZATION_CHANGED');
  }

  return lease;
}

export async function prepareLiveWorkspaceTerminal(args: {
  pool: Pool;
  collaborationId: string;
  participantId: string;
  bindingId: string;
}): Promise<LiveWorkspaceTerminalTarget> {
  const lease = await getActiveControlLease({
    queryable: args.pool,
    collaborationId: args.collaborationId,
    participantId: args.participantId,
    bindingId: args.bindingId,
    surface: 'terminal',
  });
  if (!lease) {
    throw new LiveWorkspaceError('An active terminal control lease is required before opening shared terminal input.', 403, 'TERMINAL_CONTROL_LEASE_REQUIRED');
  }

  const result = await args.pool.query<TerminalTargetRow>(
    `SELECT resource.id AS binding_id,
            resource.resource_id AS lab_instance_id,
            resource.resource_owner_id,
            lab.owner_id AS lab_owner_id,
            COALESCE(resource.metadata->>'label', definition.name, definition.slug, 'Cyber Lab') AS label,
            CASE WHEN lab.metadata->>'accessMode' = 'desktop' THEN 'desktop' ELSE 'terminal' END AS access_mode,
            lab.status,
            lab.runtime_provider,
            lab.runtime_external_id,
            lab.expires_at,
            lab.last_error
       FROM live_workspace_resources resource
       JOIN collaborations collaboration ON collaboration.id = resource.collaboration_id
       JOIN live_workspaces workspace ON workspace.collaboration_id = collaboration.id
       JOIN lab_instances lab ON lab.id = resource.resource_id
       JOIN lab_definitions definition ON definition.id = lab.definition_id
      WHERE resource.id=$1
        AND resource.collaboration_id=$2
        AND resource.resource_type='lab-instance'
        AND resource.status='attached'
        AND collaboration.status='active'
        AND collaboration.collaboration_type='live-workspace'
        AND workspace.status='active'
        AND (workspace.expires_at IS NULL OR workspace.expires_at > NOW())
      LIMIT 1`,
    [args.bindingId, args.collaborationId]
  );
  const row = result.rows[0];
  if (!row || row.lab_instance_id !== lease.labInstanceId) {
    throw new LiveWorkspaceError('The leased lab is no longer attached to this Live Workspace.', 409, 'TERMINAL_LAB_BINDING_CHANGED');
  }
  if (row.resource_owner_id !== row.lab_owner_id) {
    throw new LiveWorkspaceError('The attached lab no longer belongs to its contributing participant.', 403, 'TERMINAL_LAB_OWNERSHIP_MISMATCH');
  }
  if (row.access_mode !== 'terminal') {
    throw new LiveWorkspaceError('This attached lab was not provisioned for terminal access.', 409, 'TERMINAL_SURFACE_UNAVAILABLE');
  }
  if (row.runtime_provider !== 'aws-ec2' || !row.runtime_external_id) {
    throw new LiveWorkspaceError('The attached lab does not have an AWS EC2 runtime available for terminal access.', 409, 'TERMINAL_RUNTIME_MISSING');
  }
  if (row.expires_at && new Date(row.expires_at).getTime() <= Date.now()) {
    throw new LiveWorkspaceError('The attached lab has expired.', 410, 'TERMINAL_LAB_EXPIRED');
  }

  let diagnostics: LabTerminalDiagnostics;
  try {
    diagnostics = await getLabTerminalDiagnostics(row.runtime_external_id);
    await reconcileObservedState(args.pool, row, diagnostics);
  } catch (error) {
    throw new LiveWorkspaceError(
      error instanceof Error ? error.message : 'Could not inspect the shared terminal path.',
      503,
      'TERMINAL_DIAGNOSTICS_FAILED'
    );
  }

  if (diagnostics.ec2State === 'destroyed' || diagnostics.ec2State === 'destroying') {
    throw new LiveWorkspaceError('The attached EC2 instance no longer exists as a usable lab.', 410, 'TERMINAL_EC2_TERMINATED');
  }
  if (diagnostics.ec2State !== 'running') {
    throw new LiveWorkspaceError(`The attached EC2 instance is ${diagnostics.ec2State}; shared terminal input requires a running instance.`, 409, 'TERMINAL_EC2_NOT_RUNNING');
  }
  if (!diagnostics.instanceProfileConfigured) {
    throw new LiveWorkspaceError('LAB_AWS_INSTANCE_PROFILE is not configured for terminal access.', 503, 'TERMINAL_SSM_PROFILE_MISSING');
  }
  if (!diagnostics.ssmRegistered) {
    throw new LiveWorkspaceError('The attached EC2 instance is not registered with Systems Manager yet.', 503, 'TERMINAL_SSM_NOT_REGISTERED');
  }
  if (diagnostics.ssmPingStatus !== 'Online') {
    throw new LiveWorkspaceError(`Systems Manager reports ${diagnostics.ssmPingStatus || 'unknown'} instead of Online.`, 503, 'TERMINAL_SSM_OFFLINE');
  }

  return {
    authorization: {
      collaborationId: args.collaborationId,
      participantId: args.participantId,
      bindingId: args.bindingId,
      labInstanceId: row.lab_instance_id,
      leaseId: lease.id,
      surface: 'terminal',
    },
    label: row.label,
    runtimeExternalId: row.runtime_external_id,
    diagnostics,
    leaseExpiresAt: lease.expiresAt,
  };
}
