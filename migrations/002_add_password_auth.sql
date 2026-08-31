-- Migration: Add email/password authentication support
-- Date: 2025-10-25
-- Description: Adds password_hash column and makes public_key optional for email/password users

ALTER TABLE users 
ADD COLUMN IF NOT EXISTS password_hash TEXT;

-- Add last_seen_at for tracking user activity
ALTER TABLE users
ADD COLUMN IF NOT EXISTS last_seen_at TIMESTAMP WITH TIME ZONE;

-- Older schemas required DID public keys. Email/password accounts do not.
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'users'
          AND column_name = 'public_key'
    ) THEN
        ALTER TABLE users ALTER COLUMN public_key DROP NOT NULL;
    END IF;
END $$;

ALTER TABLE users ALTER COLUMN email TYPE VARCHAR(320);

-- Enforce one account per email, case-insensitively.
DROP INDEX IF EXISTS idx_users_email_unique;
DROP INDEX IF EXISTS idx_users_email;
CREATE UNIQUE INDEX idx_users_email_unique
ON users(LOWER(email))
WHERE email IS NOT NULL;

-- Add comments
COMMENT ON COLUMN users.password_hash IS 'bcrypt hashed password for email/password authentication';
COMMENT ON COLUMN users.last_seen_at IS 'Last activity timestamp, updated on login and API requests';
