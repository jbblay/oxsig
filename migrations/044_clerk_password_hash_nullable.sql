-- Clerk-authenticated users do not have an OxSig-managed password.
-- Keep legacy password authentication rows protected while allowing a fresh
-- Clerk identity to create its internal OxSig UUID without a fake password.

ALTER TABLE users
ALTER COLUMN password_hash DROP NOT NULL;

ALTER TABLE users
DROP CONSTRAINT IF EXISTS check_legacy_user_password_hash;

ALTER TABLE users
ADD CONSTRAINT check_legacy_user_password_hash
CHECK (auth_provider <> 'legacy' OR password_hash IS NOT NULL);

COMMENT ON COLUMN users.password_hash IS 'Legacy/local authentication password hash. NULL for Clerk-authenticated users.';
