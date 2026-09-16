-- Durable shared coordination for Live Workspace.
-- Notes, checklist items and point-in-time resource snapshots are workspace-scoped.
-- Activity events form a compact multi-user timeline without replacing personal browser activity.

CREATE TABLE IF NOT EXISTS live_workspace_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    collaboration_id UUID NOT NULL REFERENCES live_workspaces(collaboration_id) ON DELETE CASCADE,
    author_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    kind VARCHAR(16) NOT NULL CHECK (kind IN ('note', 'checklist', 'snapshot')),
    content TEXT NOT NULL CHECK (char_length(content) BETWEEN 1 AND 2000),
    completed_at TIMESTAMPTZ,
    completed_by UUID REFERENCES users(id) ON DELETE SET NULL,
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_live_workspace_items_workspace
    ON live_workspace_items(collaboration_id, created_at DESC)
    WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_live_workspace_items_checklist
    ON live_workspace_items(collaboration_id, completed_at, created_at DESC)
    WHERE kind = 'checklist' AND deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS live_workspace_activity_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    collaboration_id UUID NOT NULL REFERENCES live_workspaces(collaboration_id) ON DELETE CASCADE,
    actor_id UUID REFERENCES users(id) ON DELETE SET NULL,
    event_type VARCHAR(64) NOT NULL,
    summary VARCHAR(240) NOT NULL,
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_live_workspace_activity_workspace
    ON live_workspace_activity_events(collaboration_id, created_at DESC);

COMMENT ON TABLE live_workspace_items IS 'Durable shared notes, checklist items, and resource snapshots for a Live Workspace.';
COMMENT ON TABLE live_workspace_activity_events IS 'Compact durable multi-user activity timeline for Live Workspace coordination.';
