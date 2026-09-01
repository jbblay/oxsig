-- Migration: Add user profile columns
-- Date: 2025-10-26
-- Description: Adds missing columns used in API endpoints

-- Add bio column for user profiles
ALTER TABLE users 
ADD COLUMN IF NOT EXISTS bio TEXT;

-- Add avatar URL
ALTER TABLE users
ADD COLUMN IF NOT EXISTS avatar_url TEXT;

-- Add role column with default 'user'
ALTER TABLE users
ADD COLUMN IF NOT EXISTS role VARCHAR(20) DEFAULT 'user';

-- Add email verification flag
ALTER TABLE users
ADD COLUMN IF NOT EXISTS email_verified BOOLEAN DEFAULT false;

-- Add two-factor authentication flag
ALTER TABLE users
ADD COLUMN IF NOT EXISTS two_factor_enabled BOOLEAN DEFAULT false;

-- Add indexes
CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);
CREATE INDEX IF NOT EXISTS idx_users_email_verified ON users(email_verified) WHERE email_verified = true;

-- PostgreSQL does not support ALTER TABLE ... ADD CONSTRAINT IF NOT EXISTS.
-- Check pg_constraint explicitly so the migration remains safe to re-run.
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'check_user_role'
          AND conrelid = 'users'::regclass
    ) THEN
        ALTER TABLE users
        ADD CONSTRAINT check_user_role CHECK (role IN ('user', 'admin', 'moderator'));
    END IF;
END $$;

-- Add comments
COMMENT ON COLUMN users.bio IS 'User biography/description (max 500 characters)';
COMMENT ON COLUMN users.avatar_url IS 'URL to user avatar image';
COMMENT ON COLUMN users.role IS 'User role for RBAC (user, admin, moderator)';
COMMENT ON COLUMN users.email_verified IS 'Whether email address has been verified';
COMMENT ON COLUMN users.two_factor_enabled IS 'Whether 2FA is enabled for this account';
