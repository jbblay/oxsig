-- Repair older installations so the core document-signing flow has the same
-- columns as a fresh database.

ALTER TABLE documents ADD COLUMN IF NOT EXISTS storage_key TEXT;
ALTER TABLE documents ADD COLUMN IF NOT EXISTS content_hash VARCHAR(64);

UPDATE documents
SET content_hash = LOWER(metadata->>'sha256')
WHERE content_hash IS NULL
  AND metadata->>'sha256' ~* '^[0-9a-f]{64}$';

UPDATE documents
SET content_hash = encode(digest(convert_to(COALESCE(content, ''), 'UTF8'), 'sha256'), 'hex')
WHERE content_hash IS NULL
  AND storage_key IS NULL
  AND file_url IS NULL;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'documents_content_hash_format'
          AND conrelid = 'documents'::regclass
    ) THEN
        ALTER TABLE documents
        ADD CONSTRAINT documents_content_hash_format
        CHECK (content_hash IS NULL OR content_hash ~ '^[0-9a-f]{64}$');
    END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_documents_content_hash
ON documents(content_hash) WHERE content_hash IS NOT NULL;

ALTER TABLE signatures ADD COLUMN IF NOT EXISTS verified BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE signatures ADD COLUMN IF NOT EXISTS verified_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_signatures_verified
ON signatures(verified, created_at DESC);
