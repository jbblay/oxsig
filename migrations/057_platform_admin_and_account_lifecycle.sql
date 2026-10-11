-- Migration: Platform administration and account lifecycle
-- Description: Adds suspension state for platform admins, low-friction onboarding
-- state, richer operator profiles, and indexes that keep the admin console fast.

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS suspended_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS suspended_reason VARCHAR(500),
  ADD COLUMN IF NOT EXISTS suspended_by UUID,
  ADD COLUMN IF NOT EXISTS onboarded_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS headline VARCHAR(120),
  ADD COLUMN IF NOT EXISTS location VARCHAR(80),
  ADD COLUMN IF NOT EXISTS website_url TEXT,
  ADD COLUMN IF NOT EXISTS experience_level VARCHAR(20),
  ADD COLUMN IF NOT EXISTS focus_areas TEXT[] NOT NULL DEFAULT '{}';

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'users_suspended_by_fkey') THEN
    ALTER TABLE users
      ADD CONSTRAINT users_suspended_by_fkey
      FOREIGN KEY (suspended_by) REFERENCES users(id) ON DELETE SET NULL;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'check_user_experience_level') THEN
    ALTER TABLE users
      ADD CONSTRAINT check_user_experience_level
      CHECK (experience_level IS NULL OR experience_level IN ('new', 'practitioner', 'professional', 'expert'));
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'check_user_focus_areas_size') THEN
    ALTER TABLE users
      ADD CONSTRAINT check_user_focus_areas_size
      CHECK (cardinality(focus_areas) <= 8);
  END IF;
END $$;

-- Accounts that existed before onboarding shipped are already onboarded; only
-- genuinely new accounts should see the one-step welcome.
UPDATE users SET onboarded_at = created_at WHERE onboarded_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_users_suspended_at ON users(suspended_at) WHERE suspended_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_users_created_at ON users(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_users_last_seen_at ON users(last_seen_at DESC);
CREATE INDEX IF NOT EXISTS idx_lab_instances_status_created ON lab_instances(status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_operation_runs_status_created ON operation_runs(status, created_at DESC);
