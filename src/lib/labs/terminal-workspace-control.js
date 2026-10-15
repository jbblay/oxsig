function dataBuffer(data) {
  if (typeof data === 'string') return null;
  if (Buffer.isBuffer(data)) return data;
  if (Array.isArray(data)) return Buffer.concat(data.map((part) => Buffer.from(part)));
  if (data instanceof ArrayBuffer) return Buffer.from(data);
  if (ArrayBuffer.isView(data)) {
    return Buffer.from(data.buffer, data.byteOffset, data.byteLength);
  }
  return null;
}

/**
 * Browser-side SSM acknowledgements are the only binary frames that can pass
 * without another shared-control lookup. Unknown or malformed binary frames are
 * treated as input and fail closed behind live authorization.
 */
export function terminalFrameRequiresWorkspaceControlRevalidation(data) {
  const buffer = dataBuffer(data);
  if (!buffer) return false;
  if (buffer.byteLength < 120) return true;
  const messageType = buffer.subarray(4, 36).toString('utf8').replace(/\0/g, '').trim();
  return messageType !== 'acknowledge';
}

export async function assertTerminalWorkspaceControl(queryable, authorization) {
  if (!authorization) return;
  if (!queryable || typeof queryable.query !== 'function') {
    throw new Error('Database authorization is unavailable for shared terminal control.');
  }
  if (authorization.surface !== 'terminal') {
    throw new Error('Shared terminal authorization requires the terminal surface.');
  }

  const result = await queryable.query(
    `SELECT 1
       FROM live_workspace_control_leases lease
       JOIN live_workspaces workspace
         ON workspace.collaboration_id=lease.collaboration_id
        AND workspace.status='active'
        AND (workspace.expires_at IS NULL OR workspace.expires_at > NOW())
       JOIN collaborations collaboration
         ON collaboration.id=lease.collaboration_id
        AND collaboration.status='active'
        AND collaboration.collaboration_type='live-workspace'
       JOIN live_workspace_resources resource
         ON resource.id=lease.resource_binding_id
        AND resource.collaboration_id=lease.collaboration_id
        AND resource.resource_type='lab-instance'
        AND resource.status='attached'
       JOIN lab_instances lab
         ON lab.id=lease.lab_instance_id
        AND lab.id=resource.resource_id
        AND resource.resource_owner_id=lab.owner_id
        AND lab.status NOT IN ('destroying','destroyed','failed')
       LEFT JOIN collaboration_members controller_member
         ON controller_member.collaboration_id=lease.collaboration_id
        AND controller_member.user_id=lease.participant_id
        AND controller_member.status='active'
       LEFT JOIN live_workspace_participants controller_participant
         ON controller_participant.collaboration_id=lease.collaboration_id
        AND controller_participant.user_id=lease.participant_id
        AND controller_participant.status='active'
       LEFT JOIN collaboration_members resource_owner_member
         ON resource_owner_member.collaboration_id=lease.collaboration_id
        AND resource_owner_member.user_id=resource.resource_owner_id
        AND resource_owner_member.status='active'
       LEFT JOIN live_workspace_participants resource_owner_participant
         ON resource_owner_participant.collaboration_id=lease.collaboration_id
        AND resource_owner_participant.user_id=resource.resource_owner_id
        AND resource_owner_participant.status='active'
      WHERE lease.collaboration_id=$1
        AND lease.participant_id=$2
        AND lease.resource_binding_id=$3
        AND lease.id=$4
        AND lease.lab_instance_id=$5
        AND lease.surface='terminal'
        AND lease.status='active'
        AND lease.expires_at > NOW()
        AND (collaboration.owner_id=lease.participant_id OR controller_member.user_id IS NOT NULL)
        AND (collaboration.owner_id=lease.participant_id OR controller_participant.role IN ('instructor','learner'))
        AND (collaboration.owner_id=resource.resource_owner_id OR resource_owner_member.user_id IS NOT NULL)
        AND (collaboration.owner_id=resource.resource_owner_id OR resource_owner_participant.role IN ('instructor','learner'))
        AND (CASE WHEN lab.metadata->>'accessMode'='desktop' THEN 'desktop' ELSE 'terminal' END)='terminal'
      LIMIT 1`,
    [
      authorization.collaborationId,
      authorization.participantId,
      authorization.bindingId,
      authorization.leaseId,
      authorization.labInstanceId,
    ],
  );

  if (!result.rowCount) {
    throw new Error('Shared terminal control lease is no longer active.');
  }
}
