-- Profile fields retained by the minimal account surface.

ALTER TABLE users ADD COLUMN IF NOT EXISTS bio TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS role VARCHAR(20) NOT NULL DEFAULT 'user';

UPDATE users SET role = 'user' WHERE role IS NULL;
ALTER TABLE users ALTER COLUMN role SET DEFAULT 'user';
ALTER TABLE users ALTER COLUMN role SET NOT NULL;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'check_user_role' AND conrelid = 'users'::regclass
    ) THEN
        ALTER TABLE users
        ADD CONSTRAINT check_user_role CHECK (role IN ('user', 'admin', 'moderator'));
    END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);
