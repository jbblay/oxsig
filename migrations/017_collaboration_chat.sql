-- Conversation-first collaboration foundation.
-- Adds a durable message timeline to the collaboration/session model that
-- already exists in 004_collaboration_system.sql.

CREATE TABLE IF NOT EXISTS collaboration_messages (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    collaboration_id UUID NOT NULL REFERENCES collaborations(id) ON DELETE CASCADE,
    sender_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    message_type VARCHAR(32) NOT NULL DEFAULT 'text',
    body TEXT NOT NULL DEFAULT '',
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    edited_at TIMESTAMPTZ,
    CONSTRAINT collaboration_messages_type_check CHECK (
        message_type IN ('text', 'explain', 'resource', 'audio', 'practice', 'system')
    )
);

CREATE INDEX IF NOT EXISTS idx_collaboration_messages_collaboration_created
    ON collaboration_messages(collaboration_id, created_at);
CREATE INDEX IF NOT EXISTS idx_collaboration_messages_sender
    ON collaboration_messages(sender_id, created_at DESC);

-- Existing collaboration owners should also appear in the participant list.
INSERT INTO collaboration_members (
    collaboration_id,
    user_id,
    role,
    permissions,
    status,
    invited_by
)
SELECT
    c.id,
    c.owner_id,
    'owner',
    '{"read": true, "write": true, "admin": true}'::jsonb,
    'active',
    c.owner_id
FROM collaborations c
ON CONFLICT (collaboration_id, user_id) DO UPDATE
SET role = CASE
        WHEN collaboration_members.role = 'owner' THEN collaboration_members.role
        ELSE 'owner'
    END,
    permissions = '{"read": true, "write": true, "admin": true}'::jsonb,
    status = 'active';

COMMENT ON TABLE collaboration_messages IS
    'Persistent conversation timeline for text, explanation, resources, voice notes and practice activities.';
