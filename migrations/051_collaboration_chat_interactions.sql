-- Durable collaboration chat state and message interactions.

ALTER TABLE collaboration_members
  ADD COLUMN IF NOT EXISTS last_read_at TIMESTAMPTZ;

ALTER TABLE collaboration_messages
  ADD COLUMN IF NOT EXISTS reply_to_message_id UUID REFERENCES collaboration_messages(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS client_message_id UUID,
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;

CREATE UNIQUE INDEX IF NOT EXISTS idx_collaboration_messages_client_message
  ON collaboration_messages(collaboration_id, user_id, client_message_id)
  WHERE client_message_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_collaboration_messages_reply_to
  ON collaboration_messages(reply_to_message_id)
  WHERE reply_to_message_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_collaboration_members_unread_cursor
  ON collaboration_members(collaboration_id, user_id, last_read_at);

CREATE TABLE IF NOT EXISTS collaboration_message_reactions (
  message_id UUID NOT NULL REFERENCES collaboration_messages(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  emoji VARCHAR(16) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (message_id, user_id, emoji)
);

CREATE INDEX IF NOT EXISTS idx_collaboration_message_reactions_message
  ON collaboration_message_reactions(message_id, created_at);

COMMENT ON COLUMN collaboration_members.last_read_at IS 'Durable per-member collaboration read cursor';
COMMENT ON COLUMN collaboration_messages.reply_to_message_id IS 'Parent message for threaded reply context';
COMMENT ON COLUMN collaboration_messages.client_message_id IS 'Client-generated idempotency key for retries';
COMMENT ON COLUMN collaboration_messages.deleted_at IS 'Soft-delete timestamp preserving thread references';
COMMENT ON TABLE collaboration_message_reactions IS 'Per-user emoji reactions on collaboration messages';
