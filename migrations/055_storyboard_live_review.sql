-- Durable spatial review comments for shared Boards.
-- Comments are anchored to normalized canvas coordinates so they survive zoom/reflow.

CREATE TABLE IF NOT EXISTS storyboard_comments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES storyboard_sessions(id) ON DELETE CASCADE,
  author_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  point_x DOUBLE PRECISION NOT NULL CHECK (point_x >= 0 AND point_x <= 1),
  point_y DOUBLE PRECISION NOT NULL CHECK (point_y >= 0 AND point_y <= 1),
  body TEXT NOT NULL CHECK (char_length(body) BETWEEN 1 AND 2000),
  resolved_at TIMESTAMPTZ,
  resolved_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_storyboard_comments_session
  ON storyboard_comments(session_id, created_at ASC)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_storyboard_comments_unresolved
  ON storyboard_comments(session_id, created_at ASC)
  WHERE resolved_at IS NULL AND deleted_at IS NULL;

COMMENT ON TABLE storyboard_comments IS
  'Durable canvas-anchored review comments for Storyboards/Boards.';
