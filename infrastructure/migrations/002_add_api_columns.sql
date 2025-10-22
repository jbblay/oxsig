-- Migration 002: Add columns expected by API routes
-- Aligns database schema with Next.js API route expectations

-- Add columns to documents table that API routes expect
ALTER TABLE documents ADD COLUMN IF NOT EXISTS content_type VARCHAR(100);
ALTER TABLE documents ADD COLUMN IF NOT EXISTS encrypted BOOLEAN DEFAULT FALSE;
ALTER TABLE documents ADD COLUMN IF NOT EXISTS encryption_key TEXT;
ALTER TABLE documents ADD COLUMN IF NOT EXISTS file_url TEXT;
ALTER TABLE documents ADD COLUMN IF NOT EXISTS status VARCHAR(50) DEFAULT 'draft';
ALTER TABLE documents ADD COLUMN IF NOT EXISTS tags TEXT[] DEFAULT '{}';

-- Create index for status and tags for better query performance
CREATE INDEX IF NOT EXISTS idx_documents_status ON documents(status);
CREATE INDEX IF NOT EXISTS idx_documents_tags ON documents USING GIN(tags);
CREATE INDEX IF NOT EXISTS idx_documents_encrypted ON documents(encrypted);

-- Add columns to signatures table that API routes expect
ALTER TABLE signatures ADD COLUMN IF NOT EXISTS signer_name VARCHAR(255);
ALTER TABLE signatures ADD COLUMN IF NOT EXISTS signer_email VARCHAR(255);
ALTER TABLE signatures ADD COLUMN IF NOT EXISTS signature_type VARCHAR(50) DEFAULT 'draw';
ALTER TABLE signatures ADD COLUMN IF NOT EXISTS algorithm VARCHAR(50);
ALTER TABLE signatures ADD COLUMN IF NOT EXISTS ip_address INET;
ALTER TABLE signatures ADD COLUMN IF NOT EXISTS location VARCHAR(255);
ALTER TABLE signatures ADD COLUMN IF NOT EXISTS verified BOOLEAN DEFAULT FALSE;
ALTER TABLE signatures ADD COLUMN IF NOT EXISTS verified_at TIMESTAMP WITH TIME ZONE;
ALTER TABLE signatures ADD COLUMN IF NOT EXISTS blockchain_tx_hash TEXT;

-- Update existing signature_algorithm column to algorithm (if needed)
-- Note: PostgreSQL doesn't support renaming with ADD COLUMN IF NOT EXISTS in the same way
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'signatures' AND column_name = 'algorithm') THEN
        -- If algorithm column doesn't exist, rename signature_algorithm to algorithm
        IF EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'signatures' AND column_name = 'signature_algorithm') THEN
            ALTER TABLE signatures RENAME COLUMN signature_algorithm TO algorithm;
        END IF;
    END IF;
END $$;

-- Create indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_signatures_signature_type ON signatures(signature_type);
CREATE INDEX IF NOT EXISTS idx_signatures_verified ON signatures(verified);
CREATE INDEX IF NOT EXISTS idx_signatures_blockchain_tx ON signatures(blockchain_tx_hash);

-- Add columns to users table for auth system
ALTER TABLE users ADD COLUMN IF NOT EXISTS email VARCHAR(255) UNIQUE;
ALTER TABLE users ADD COLUMN IF NOT EXISTS password_hash TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS role VARCHAR(50) DEFAULT 'user';
ALTER TABLE users ADD COLUMN IF NOT EXISTS email_verified BOOLEAN DEFAULT FALSE;
ALTER TABLE users ADD COLUMN IF NOT EXISTS two_factor_enabled BOOLEAN DEFAULT FALSE;

-- Create indexes for auth queries
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);

-- Comments for documentation
COMMENT ON COLUMN documents.content_type IS 'MIME type or content format (html, markdown, etc.)';
COMMENT ON COLUMN documents.encrypted IS 'Whether the document content is encrypted';
COMMENT ON COLUMN documents.encryption_key IS 'Encrypted symmetric key for document encryption';
COMMENT ON COLUMN documents.status IS 'Document status: draft, published, archived';
COMMENT ON COLUMN documents.tags IS 'Array of tags for categorization';

COMMENT ON COLUMN signatures.signature_type IS 'Type of signature: draw, type, upload, certificate';
COMMENT ON COLUMN signatures.algorithm IS 'Signature algorithm: ed25519, rsa, ecdsa';
COMMENT ON COLUMN signatures.verified IS 'Whether the signature has been verified';
COMMENT ON COLUMN signatures.blockchain_tx_hash IS 'Transaction hash if anchored to blockchain';
