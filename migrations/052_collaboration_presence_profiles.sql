-- Collaboration presence profile fields.

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS collaboration_status VARCHAR(20) NOT NULL DEFAULT 'available',
  ADD COLUMN IF NOT EXISTS collaboration_status_message VARCHAR(80);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'check_users_collaboration_status'
      AND conrelid = 'users'::regclass
  ) THEN
    ALTER TABLE users
      ADD CONSTRAINT check_users_collaboration_status
      CHECK (collaboration_status IN ('available', 'busy', 'away', 'focus'));
  END IF;
END $$;

COMMENT ON COLUMN users.collaboration_status IS 'User-selected collaboration availability: available, busy, away, or focus';
COMMENT ON COLUMN users.collaboration_status_message IS 'Short user-authored collaboration status message';
