-- Live Workspace Control Leases v1.
--
-- Workspace membership and resource attachment remain visibility/collaboration
-- concepts only. Terminal/desktop input requires a separate, explicit,
-- time-bounded lease created from an approved control request.

CREATE TABLE IF NOT EXISTS live_workspace_control_requests (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    collaboration_id UUID NOT NULL REFERENCES live_workspaces(collaboration_id) ON DELETE CASCADE,
    participant_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    resource_binding_id UUID NOT NULL REFERENCES live_workspace_resources(id) ON DELETE CASCADE,
    lab_instance_id UUID NOT NULL REFERENCES lab_instances(id) ON DELETE CASCADE,
    surface VARCHAR(16) NOT NULL CHECK (surface IN ('terminal', 'desktop')),
    status VARCHAR(16) NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending', 'approved', 'denied', 'cancelled')),
    requested_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    decided_at TIMESTAMPTZ,
    decided_by UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CHECK (
        (status = 'pending' AND decided_at IS NULL AND decided_by IS NULL)
        OR (status <> 'pending' AND decided_at IS NOT NULL)
    )
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_live_workspace_control_requests_one_pending
    ON live_workspace_control_requests(collaboration_id, participant_id, resource_binding_id, surface)
    WHERE status = 'pending';

CREATE INDEX IF NOT EXISTS idx_live_workspace_control_requests_workspace
    ON live_workspace_control_requests(collaboration_id, status, requested_at DESC);

CREATE INDEX IF NOT EXISTS idx_live_workspace_control_requests_participant
    ON live_workspace_control_requests(participant_id, status, requested_at DESC);

CREATE TABLE IF NOT EXISTS live_workspace_control_leases (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    request_id UUID NOT NULL UNIQUE REFERENCES live_workspace_control_requests(id) ON DELETE RESTRICT,
    collaboration_id UUID NOT NULL REFERENCES live_workspaces(collaboration_id) ON DELETE CASCADE,
    participant_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    resource_binding_id UUID NOT NULL REFERENCES live_workspace_resources(id) ON DELETE CASCADE,
    lab_instance_id UUID NOT NULL REFERENCES lab_instances(id) ON DELETE CASCADE,
    surface VARCHAR(16) NOT NULL CHECK (surface IN ('terminal', 'desktop')),
    granted_by UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    status VARCHAR(16) NOT NULL DEFAULT 'active'
        CHECK (status IN ('active', 'revoked', 'expired')),
    granted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expires_at TIMESTAMPTZ NOT NULL,
    revoked_at TIMESTAMPTZ,
    revoked_by UUID REFERENCES users(id) ON DELETE SET NULL,
    revocation_reason VARCHAR(64),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CHECK (expires_at > granted_at),
    CHECK (
        (status = 'revoked' AND revoked_at IS NOT NULL)
        OR status <> 'revoked'
    )
);

-- Expired rows are converted to status='expired' before a new grant. This unique
-- partial index is the database-level backstop preventing two simultaneous active
-- controllers for the same attached lab surface.
CREATE UNIQUE INDEX IF NOT EXISTS idx_live_workspace_control_leases_one_active_controller
    ON live_workspace_control_leases(resource_binding_id, surface)
    WHERE status = 'active';

CREATE INDEX IF NOT EXISTS idx_live_workspace_control_leases_workspace
    ON live_workspace_control_leases(collaboration_id, status, expires_at ASC);

CREATE INDEX IF NOT EXISTS idx_live_workspace_control_leases_participant
    ON live_workspace_control_leases(participant_id, status, expires_at ASC);

CREATE INDEX IF NOT EXISTS idx_live_workspace_control_leases_binding_surface
    ON live_workspace_control_leases(resource_binding_id, surface, status, expires_at ASC);

COMMENT ON TABLE live_workspace_control_requests IS
    'Auditable requests for shared terminal/desktop control. A pending request grants no machine input capability.';
COMMENT ON TABLE live_workspace_control_leases IS
    'Explicit time-bounded authorization binding workspace, participant, attached lab, surface, grantor and expiry. Transport must revalidate an active lease server-side.';
