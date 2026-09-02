-- Migration 012: Clerk identity mapping
-- Clerk authenticates users; OxSig keeps its UUID as the internal relational identity.

ALTER TABLE users
ADD COLUMN IF NOT EXISTS clerk_user_id TEXT;

ALTER TABLE users
ADD COLUMN IF NOT EXISTS auth_provider VARCHAR(20) NOT NULL DEFAULT 'legacy';

ALTER TABLE users
ADD COLUMN IF NOT EXISTS clerk_synced_at TIMESTAMPTZ;

ALTER TABLE users
ADD COLUMN IF NOT EXISTS clerk_deleted_at TIMESTAMPTZ;

CREATE UNIQUE INDEX IF NOT EXISTS idx_users_clerk_user_id_unique
ON users(clerk_user_id)
WHERE clerk_user_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_users_auth_provider
ON users(auth_provider);

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'check_user_auth_provider'
          AND conrelid = 'users'::regclass
    ) THEN
        ALTER TABLE users
        ADD CONSTRAINT check_user_auth_provider
        CHECK (auth_provider IN ('legacy', 'clerk'));
    END IF;
END $$;

COMMENT ON COLUMN users.clerk_user_id IS 'External Clerk user identifier. OxSig UUID remains the primary key used by foreign keys.';
COMMENT ON COLUMN users.auth_provider IS 'Primary interactive authentication provider for the account during migration.';
COMMENT ON COLUMN users.clerk_synced_at IS 'Last successful synchronization from Clerk user data.';
COMMENT ON COLUMN users.clerk_deleted_at IS 'Timestamp Clerk reported the external user deleted; OxSig record is retained for audit/reference.';
