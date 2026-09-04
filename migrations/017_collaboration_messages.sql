-- Conversation-first collaboration messages

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

COMMENT ON TABLE collaboration_messages IS 'Persistent conversation timeline for collaboration sessions';
