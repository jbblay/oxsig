-- Migration: Add missing indexes and constraints for performance
-- Date: 2025-10-27
-- Description: Adds indexes and constraints identified in code analysis

-- ============================================================================
-- Users Table Improvements
-- ============================================================================

-- Add UNIQUE constraint on email (if not already exists)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'users_email_key'
          AND conrelid = 'users'::regclass
    ) THEN
        ALTER TABLE users ADD CONSTRAINT users_email_key UNIQUE (email);
    END IF;
END $$;

-- Add index on last_seen_at for activity tracking
CREATE INDEX IF NOT EXISTS idx_users_last_seen_at
ON users(last_seen_at DESC)
WHERE last_seen_at IS NOT NULL;

-- Add index on password_hash for faster lookups
CREATE INDEX IF NOT EXISTS idx_users_password_hash
ON users(password_hash)
WHERE password_hash IS NOT NULL;

-- ============================================================================
-- Files Table Improvements
-- ============================================================================

-- Add index on bucket_name for storage queries
CREATE INDEX IF NOT EXISTS idx_files_bucket_name
ON files(bucket_name);

-- Add index on folder_path for hierarchical queries
CREATE INDEX IF NOT EXISTS idx_files_folder_path
ON files(folder_path);

-- Add index on upload_status for filtering
CREATE INDEX IF NOT EXISTS idx_files_upload_status
ON files(upload_status);

-- Add index on is_encrypted for security filtering
CREATE INDEX IF NOT EXISTS idx_files_is_encrypted
ON files(is_encrypted);

-- Add composite index for user + upload date
CREATE INDEX IF NOT EXISTS idx_files_user_uploaded
ON files(user_id, uploaded_at DESC);

-- ============================================================================
-- Documents Table Improvements
-- ============================================================================

-- Add composite index for owner + status
CREATE INDEX IF NOT EXISTS idx_documents_owner_status
ON documents(owner_id, status);

-- Add index on encrypted flag
CREATE INDEX IF NOT EXISTS idx_documents_encrypted
ON documents(encrypted);

-- Add index on content_type for filtering
CREATE INDEX IF NOT EXISTS idx_documents_content_type
ON documents(content_type);

-- ============================================================================
-- Signatures Table Improvements
-- ============================================================================

-- Add composite index for document + signer
CREATE INDEX IF NOT EXISTS idx_signatures_doc_signer
ON signatures(document_id, signer_id);

-- Add index on algorithm for filtering
CREATE INDEX IF NOT EXISTS idx_signatures_algorithm
ON signatures(algorithm);

-- ============================================================================
-- Sessions Table Improvements
-- ============================================================================

-- Add composite index for user + expiration
CREATE INDEX IF NOT EXISTS idx_sessions_user_expires
ON sessions(user_id, expires_at DESC);

-- Add index on revoked_at for cleanup
CREATE INDEX IF NOT EXISTS idx_sessions_revoked_at
ON sessions(revoked_at)
WHERE revoked_at IS NOT NULL;

-- ============================================================================
-- Collaboration Tables Improvements
-- ============================================================================

-- Add composite index for collaboration + user
CREATE INDEX IF NOT EXISTS idx_collaboration_members_collab_user
ON collaboration_members(collaboration_id, user_id);

-- Add index on last_active_at for activity tracking
CREATE INDEX IF NOT EXISTS idx_collaboration_members_last_active
ON collaboration_members(last_active_at DESC)
WHERE last_active_at IS NOT NULL;

-- Add index on collaboration_type
CREATE INDEX IF NOT EXISTS idx_collaborations_type
ON collaborations(collaboration_type);

-- Add index on expires_at for cleanup
CREATE INDEX IF NOT EXISTS idx_collaborations_expires_at
ON collaborations(expires_at)
WHERE expires_at IS NOT NULL;

-- ============================================================================
-- WebRTC Sessions Improvements
-- ============================================================================

-- Add composite index for collaboration + status
CREATE INDEX IF NOT EXISTS idx_webrtc_sessions_collab_status
ON webrtc_sessions(collaboration_id, status);

-- Add index on session_type for filtering
CREATE INDEX IF NOT EXISTS idx_webrtc_sessions_type
ON webrtc_sessions(session_type);

-- ============================================================================
-- Audit Logs Improvements
-- ============================================================================

-- Add composite index for user + created_at
CREATE INDEX IF NOT EXISTS idx_audit_logs_user_created
ON audit_logs(user_id, created_at DESC);

-- Add composite index for resource
CREATE INDEX IF NOT EXISTS idx_audit_logs_resource_full
ON audit_logs(resource_type, resource_id, created_at DESC);

-- ============================================================================
-- Legacy Activity Log Improvements
-- ============================================================================
-- Historical deployments could contain an activity_log table outside the
-- current tracked schema. Fresh tracked databases do not create that table, so
-- keep these optional indexes for compatibility without making it a prerequisite.
DO $$
BEGIN
    IF to_regclass('public.activity_log') IS NOT NULL THEN
        EXECUTE 'CREATE INDEX IF NOT EXISTS idx_activity_log_user_type ON activity_log(user_id, activity_type)';
        EXECUTE 'CREATE INDEX IF NOT EXISTS idx_activity_log_entity_full ON activity_log(entity_type, entity_id, created_at DESC)';
        EXECUTE 'CREATE INDEX IF NOT EXISTS idx_activity_log_session ON activity_log(session_id) WHERE session_id IS NOT NULL';
    END IF;
END $$;

-- ============================================================================
-- File Shares Improvements
-- ============================================================================

-- Add composite index for file + user
CREATE INDEX IF NOT EXISTS idx_file_shares_file_user
ON file_shares(file_id, shared_with_user_id);

-- Add index on expires_at for cleanup
CREATE INDEX IF NOT EXISTS idx_file_shares_expires_at
ON file_shares(expires_at)
WHERE expires_at IS NOT NULL;

-- Add index on share_token for public shares
CREATE INDEX IF NOT EXISTS idx_file_shares_token_unique
ON file_shares(share_token)
WHERE share_token IS NOT NULL;

-- ============================================================================
-- Add table comments for documentation
-- ============================================================================

COMMENT ON INDEX idx_users_last_seen_at IS 'Performance index for user activity tracking';
COMMENT ON INDEX idx_files_user_uploaded IS 'Composite index for user file queries sorted by date';
COMMENT ON INDEX idx_documents_owner_status IS 'Composite index for document filtering by owner and status';
COMMENT ON INDEX idx_signatures_doc_signer IS 'Composite index for signature lookup by document and signer';

-- ============================================================================
-- Analyze tables for query planner
-- ============================================================================

ANALYZE users;
ANALYZE documents;
ANALYZE signatures;
ANALYZE files;
ANALYZE collaborations;
ANALYZE collaboration_members;
ANALYZE sessions;
ANALYZE audit_logs;

DO $$
BEGIN
    IF to_regclass('public.activity_log') IS NOT NULL THEN
        ANALYZE activity_log;
    END IF;
END $$;

-- Do not COMMENT ON a hard-coded database name here. Hosted PostgreSQL providers
-- commonly assign their own database name, and the comment is not schema state.
