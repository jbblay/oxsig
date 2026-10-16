-- Browser-only practice checkpoints. Never a substitute for SSM-observed lab verification.
-- Immutable migrations 001-066 are unchanged. No executable code or commands are stored.
CREATE TABLE academy_simulation_progress (
  owner_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  skill_id VARCHAR(40) NOT NULL CHECK (skill_id = 'docker'),
  stage_id VARCHAR(48) NOT NULL CHECK (stage_id IN ('container','network','storage')),
  curriculum_version INTEGER NOT NULL DEFAULT 1 CHECK (curriculum_version BETWEEN 1 AND 100),
  attempts INTEGER NOT NULL DEFAULT 1 CHECK (attempts BETWEEN 1 AND 10000),
  checks JSONB NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(checks) = 'array'),
  verified_at TIMESTAMPTZ,
  sp_awarded INTEGER NOT NULL DEFAULT 0 CHECK (sp_awarded IN (0,25)),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (owner_id,skill_id,stage_id,curriculum_version),
  CONSTRAINT simulation_points_require_completion
    CHECK ((verified_at IS NULL AND sp_awarded = 0) OR (verified_at IS NOT NULL AND sp_awarded = 25))
);
CREATE INDEX idx_academy_simulation_verified
  ON academy_simulation_progress(owner_id,skill_id,curriculum_version,verified_at DESC)
  WHERE verified_at IS NOT NULL;
COMMENT ON TABLE academy_simulation_progress IS
  'Account-scoped interactive browser practice; simulation SP does not constitute live lab proof, mentor eligibility, or redeemable credit.';
