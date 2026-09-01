-- Secure Canvas / Storyboards server persistence.
-- Audio is kept in PostgreSQL for the first deployable vertical slice and is
-- deliberately capped at 4 MiB. The API contract allows this column to move to
-- private object storage later without changing ownership or sharing rules.

CREATE TABLE IF NOT EXISTS storyboard_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title VARCHAR(120) NOT NULL,
  description TEXT,
  status VARCHAR(24) NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'ready', 'archived')),
  duration_ms INTEGER NOT NULL DEFAULT 0
    CHECK (duration_ms >= 0 AND duration_ms <= 86400000),
  events JSONB NOT NULL DEFAULT '[]'::jsonb
    CHECK (jsonb_typeof(events) = 'array'),
  audio_data BYTEA,
  audio_mime_type VARCHAR(100),
  audio_size INTEGER,
  version INTEGER NOT NULL DEFAULT 1 CHECK (version > 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ,
  CHECK (
    (audio_data IS NULL AND audio_size IS NULL AND audio_mime_type IS NULL)
    OR
    (
      audio_data IS NOT NULL
      AND audio_size = octet_length(audio_data)
      AND audio_size > 0
      AND audio_size <= 4194304
      AND audio_mime_type IS NOT NULL
    )
  )
);

CREATE INDEX IF NOT EXISTS idx_storyboard_sessions_owner
  ON storyboard_sessions(owner_id, updated_at DESC)
  WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS storyboard_shares (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES storyboard_sessions(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  permission VARCHAR(16) NOT NULL CHECK (permission IN ('viewer', 'editor')),
  shared_by UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at TIMESTAMPTZ,
  revoked_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(session_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_storyboard_shares_user
  ON storyboard_shares(user_id, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_storyboard_shares_active
  ON storyboard_shares(session_id, user_id)
  WHERE revoked_at IS NULL;

COMMENT ON TABLE storyboard_sessions IS
  'Protected event-based canvas sessions. Audio is private and served only through an authorized API.';
COMMENT ON TABLE storyboard_shares IS
  'Viewer/editor grants for storyboard sessions, including expiration and revocation history.';
