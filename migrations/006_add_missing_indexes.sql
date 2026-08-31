-- Indexes for the supported account, document, signature, and session queries.

CREATE INDEX IF NOT EXISTS idx_users_last_seen_at
ON users(last_seen_at DESC)
WHERE last_seen_at IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_documents_owner_status
ON documents(owner_id, status)
WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_signatures_doc_signer
ON signatures(document_id, signer_id);

CREATE INDEX IF NOT EXISTS idx_sessions_user_expires
ON sessions(user_id, expires_at DESC);

CREATE INDEX IF NOT EXISTS idx_sessions_revoked_at
ON sessions(revoked_at)
WHERE revoked_at IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_audit_logs_user_created
ON audit_logs(user_id, created_at DESC);

ANALYZE users;
ANALYZE documents;
ANALYZE signatures;
ANALYZE sessions;
ANALYZE audit_logs;
