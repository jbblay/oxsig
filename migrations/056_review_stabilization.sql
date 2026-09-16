-- Review stabilization: optimistic concurrency metadata and migration-ledger integrity.

ALTER TABLE vault_items
  ADD COLUMN IF NOT EXISTS version BIGINT NOT NULL DEFAULT 1;

ALTER TABLE oxisg_schema_migrations
  ADD COLUMN IF NOT EXISTS checksum TEXT;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
      FROM pg_constraint
     WHERE conname = 'vault_items_version_positive'
       AND conrelid = 'vault_items'::regclass
  ) THEN
    ALTER TABLE vault_items
      ADD CONSTRAINT vault_items_version_positive CHECK (version > 0);
  END IF;
END $$;
