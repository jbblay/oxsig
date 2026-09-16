-- Complete collaboration messaging with pins, notification preferences, and action items.

ALTER TABLE collaboration_messages
  ADD COLUMN IF NOT EXISTS pinned_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS pinned_by UUID REFERENCES users(id) ON DELETE SET NULL;

ALTER TABLE collaboration_members
  ADD COLUMN IF NOT EXISTS notification_mode VARCHAR(20) NOT NULL DEFAULT 'all';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'check_collaboration_members_notification_mode'
      AND conrelid = 'collaboration_members'::regclass
  ) THEN
    ALTER TABLE collaboration_members
      ADD CONSTRAINT check_collaboration_members_notification_mode
      CHECK (notification_mode IN ('all', 'mentions', 'muted'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_collaboration_messages_pinned
  ON collaboration_messages(collaboration_id, pinned_at DESC)
  WHERE pinned_at IS NOT NULL AND deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS collaboration_action_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  collaboration_id UUID NOT NULL REFERENCES collaborations(id) ON DELETE CASCADE,
  message_id UUID REFERENCES collaboration_messages(id) ON DELETE SET NULL,
  created_by UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title VARCHAR(240) NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'open',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  CONSTRAINT check_collaboration_action_item_status CHECK (status IN ('open', 'done'))
);

CREATE INDEX IF NOT EXISTS idx_collaboration_action_items_session
  ON collaboration_action_items(collaboration_id, status, created_at DESC);

COMMENT ON COLUMN collaboration_members.notification_mode IS 'Per-collaboration notification preference: all, mentions, or muted';
COMMENT ON COLUMN collaboration_messages.pinned_at IS 'When this message was pinned in its collaboration';
COMMENT ON COLUMN collaboration_messages.pinned_by IS 'User who last pinned this message';