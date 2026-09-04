-- Migration: Restore the users.role column for databases with schema drift
-- Description: Keeps registration and token generation compatible with the RBAC contract

ALTER TABLE users
ADD COLUMN IF NOT EXISTS role VARCHAR(20) DEFAULT 'user';

UPDATE users
SET role = 'user'
WHERE role IS NULL;

ALTER TABLE users
ALTER COLUMN role SET DEFAULT 'user',
ALTER COLUMN role SET NOT NULL;

CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);