-- Migration: Add email/password authentication support
-- Date: 2025-10-25
-- Description: Adds password_hash column and makes public_key optional for email/password users

-- Add password_hash column for bcrypt hashed passwords
ALTER TABLE users 
ADD COLUMN IF NOT EXISTS password_hash TEXT;

-- Add last_seen_at for tracking user activity
ALTER TABLE users
ADD COLUMN IF NOT EXISTS last_seen_at TIMESTAMP WITH TIME ZONE;

-- Make public_key optional (email/password users don't need it)
ALTER TABLE users 
ALTER COLUMN public_key DROP NOT NULL;

-- Add index on email for faster lookups
CREATE INDEX IF NOT EXISTS idx_users_email_unique 
ON users(email) 
WHERE email IS NOT NULL;

-- Add comments
COMMENT ON COLUMN users.password_hash IS 'bcrypt hashed password for email/password authentication (10 rounds)';
COMMENT ON COLUMN users.last_seen_at IS 'Last activity timestamp, updated on login and API requests';
