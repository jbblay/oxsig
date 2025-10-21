-- Add missing columns to documents table for API compatibility
-- This migration adds columns that the API routes expect but are missing from the initial schema

-- Add content_type column (was missing, only mime_type existed)
ALTER TABLE documents ADD COLUMN IF NOT EXISTS content_type VARCHAR(50) DEFAULT 'html';

-- Add encrypted flag
ALTER TABLE documents ADD COLUMN IF NOT EXISTS encrypted BOOLEAN DEFAULT FALSE;

-- Add encryption_key for encrypted documents
ALTER TABLE documents ADD COLUMN IF NOT EXISTS encryption_key TEXT;

-- Add file_url for direct file access
ALTER TABLE documents ADD COLUMN IF NOT EXISTS file_url TEXT;

-- Add tags array for categorization
ALTER TABLE documents ADD COLUMN IF NOT EXISTS tags TEXT[] DEFAULT '{}';

-- Add status for document workflow
ALTER TABLE documents ADD COLUMN IF NOT EXISTS status VARCHAR(50) DEFAULT 'draft';

-- Create indexes for new columns
CREATE INDEX IF NOT EXISTS idx_documents_encrypted ON documents(encrypted);
CREATE INDEX IF NOT EXISTS idx_documents_status ON documents(status);
CREATE INDEX IF NOT EXISTS idx_documents_tags ON documents USING GIN(tags);

-- Add comment explaining the schema
COMMENT ON COLUMN documents.content_type IS 'Content type of the document (html, pdf, markdown, etc.)';
COMMENT ON COLUMN documents.encrypted IS 'Whether the document content is encrypted';
COMMENT ON COLUMN documents.encryption_key IS 'Encryption key ID or reference for encrypted documents';
COMMENT ON COLUMN documents.file_url IS 'Direct URL to the file in object storage';
COMMENT ON COLUMN documents.tags IS 'Array of tags for document categorization';
COMMENT ON COLUMN documents.status IS 'Document status (draft, published, archived, etc.)';

-- Ensure deleted_at is properly set up (it exists in schema but using is_deleted also)
-- The deleted_at approach is better for soft deletes
COMMENT ON COLUMN documents.deleted_at IS 'Timestamp when document was soft-deleted';
COMMENT ON COLUMN documents.is_deleted IS 'Boolean flag for soft delete (deprecated, use deleted_at)';
