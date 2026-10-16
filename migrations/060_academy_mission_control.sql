-- Durable, account-scoped OXSIG Academy mission progression.
-- Verification evidence is server-observed. Notes and XP survive disposable lab termination.
CREATE TABLE IF NOT EXISTS academy_mission_progress (
  owner_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  mission_id VARCHAR(24) NOT NULL CHECK (mission_id IN ('deploy','repair','persist')),
  lab_instance_id UUID REFERENCES lab_instances(id) ON DELETE SET NULL,
  difficulty VARCHAR(16) NOT NULL DEFAULT 'intermediate'
    CHECK (difficulty IN ('beginner','intermediate','advanced')),
  notes TEXT NOT NULL DEFAULT '',
  hints_used INTEGER NOT NULL DEFAULT 0 CHECK (hints_used BETWEEN 0 AND 100),
  prepared_at TIMESTAMPTZ,
  verified_at TIMESTAMPTZ,
  checks JSONB NOT NULL DEFAULT '[]'::jsonb,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (owner_id,mission_id),
  CONSTRAINT academy_mission_progress_notes_length CHECK (char_length(notes) <= 4000)
);
CREATE INDEX IF NOT EXISTS idx_academy_mission_progress_verified
  ON academy_mission_progress(owner_id,verified_at DESC)
  WHERE verified_at IS NOT NULL;
COMMENT ON TABLE academy_mission_progress IS
  'Per-user mission outcomes; server-verified checks only, with personal engineering notes.';
