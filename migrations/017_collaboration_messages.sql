-- Conversation-first collaboration foundation and persistent messages.
--
-- Some long-lived development databases were created before the migration
-- ledger was introduced and can report migration 004 as applied even though
-- the collaboration core tables are absent. Keep this migration self-healing
-- for the current conversation-first collaboration experience.

CREATE TABLE IF NOT EXISTS collaborations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    description TEXT,
    owner_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    status VARCHAR(50) NOT NULL DEFAULT 'active',
    collaboration_type VARCHAR(50) DEFAULT 'document',
    settings JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expires_at TIMESTAMPTZ,
    metadata JSONB DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_collaborations_owner_id
    ON collaborations(owner_id);
CREATE INDEX IF NOT EXISTS idx_collaborations_status
    ON collaborations(status);
CREATE INDEX IF NOT EXISTS idx_collaborations_created_at
    ON collaborations(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_collaborations_type
    ON collaborations(collaboration_type);

CREATE TABLE IF NOT EXISTS collaboration_members (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    collaboration_id UUID NOT NULL REFERENCES collaborations(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    role VARCHAR(50) NOT NULL DEFAULT 'member',
    permissions JSONB DEFAULT '{"read": true, "write": false, "admin": false}'::jsonb,
    status VARCHAR(50) NOT NULL DEFAULT 'active',
    invited_by UUID REFERENCES users(id),
    joined_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_active_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(collaboration_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_collaboration_members_collab_id
    ON collaboration_members(collaboration_id);
CREATE INDEX IF NOT EXISTS idx_collaboration_members_user_id
    ON collaboration_members(user_id);
CREATE INDEX IF NOT EXISTS idx_collaboration_members_role
    ON collaboration_members(role);
CREATE INDEX IF NOT EXISTS idx_collaboration_members_status
    ON collaboration_members(status);

CREATE TABLE IF NOT EXISTS collaboration_messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    collaboration_id UUID NOT NULL REFERENCES collaborations(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    content TEXT NOT NULL DEFAULT '',
    message_type VARCHAR(50) NOT NULL DEFAULT 'text',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    edited_at TIMESTAMPTZ,
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_collaboration_messages_collaboration_created
    ON collaboration_messages(collaboration_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_collaboration_messages_user
    ON collaboration_messages(user_id);

COMMENT ON TABLE collaborations IS 'Conversation-first collaboration sessions';
COMMENT ON TABLE collaboration_members IS 'Members and permissions for collaboration sessions';
COMMENT ON TABLE collaboration_messages IS 'Persistent conversation timeline for collaboration sessions';
