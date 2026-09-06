-- Live Workspace Foundation v1.
-- Reuses collaborations as the shared identity/invitation envelope while adding
-- a stricter role overlay and resource bindings for technical live sessions.
-- This migration grants no terminal or desktop control by itself.

CREATE TABLE IF NOT EXISTS live_workspaces (
    collaboration_id UUID PRIMARY KEY REFERENCES collaborations(id) ON DELETE CASCADE,
    created_by UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    status VARCHAR(16) NOT NULL DEFAULT 'active'
        CHECK (status IN ('active', 'ended')),
    ended_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_live_workspaces_status
    ON live_workspaces(status, updated_at DESC);

CREATE TABLE IF NOT EXISTS live_workspace_participants (
    collaboration_id UUID NOT NULL REFERENCES live_workspaces(collaboration_id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    role VARCHAR(16) NOT NULL CHECK (role IN ('owner', 'instructor', 'learner', 'observer')),
    status VARCHAR(16) NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'removed')),
    assigned_by UUID REFERENCES users(id) ON DELETE SET NULL,
    joined_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (collaboration_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_live_workspace_participants_user
    ON live_workspace_participants(user_id, status, updated_at DESC);

CREATE TABLE IF NOT EXISTS live_workspace_resources (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    collaboration_id UUID NOT NULL REFERENCES live_workspaces(collaboration_id) ON DELETE CASCADE,
    resource_type VARCHAR(32) NOT NULL
        CHECK (resource_type IN ('lab-instance', 'academy-course', 'infrastructure-design')),
    resource_id UUID NOT NULL,
    resource_owner_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    attached_by UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    status VARCHAR(16) NOT NULL DEFAULT 'attached' CHECK (status IN ('attached', 'detached')),
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    attached_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    detached_at TIMESTAMPTZ,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (collaboration_id, resource_type, resource_id)
);

CREATE INDEX IF NOT EXISTS idx_live_workspace_resources_workspace
    ON live_workspace_resources(collaboration_id, status, attached_at ASC);
CREATE INDEX IF NOT EXISTS idx_live_workspace_resources_owner
    ON live_workspace_resources(resource_owner_id, status);

COMMENT ON TABLE live_workspaces IS 'Technical collaboration mode layered on collaborations. Foundation only; it does not grant terminal/desktop control.';
COMMENT ON TABLE live_workspace_participants IS 'Strict Live Workspace role overlay. Generic collaboration membership alone resolves to observer until explicitly promoted.';
COMMENT ON TABLE live_workspace_resources IS 'Bindings to owner-owned technical resources. Binding grants workspace visibility but never transfers underlying resource ownership.';
