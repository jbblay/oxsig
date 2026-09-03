-- Clean-foundation identity alignment.
-- Clerk identities do not require the legacy DID/public-key field.
ALTER TABLE users ALTER COLUMN public_key DROP NOT NULL;

ALTER TABLE users ALTER COLUMN auth_provider SET DEFAULT 'clerk';
