-- Add collaboration tables to support real collaboration features
-- Migration 003: Collaboration System

-- ============================================================================
-- Collaborations Table
-- ============================================================================
CREATE TABLE IF NOT EXISTS collaborations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) NOT NULL,
    description TEXT,
    owner_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    status VARCHAR(50) NOT NULL DEFAULT 'active',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    metadata JSONB DEFAULT '{}'::jsonb
);

CREATE INDEX idx_collaborations_owner_id ON collaborations(owner_id);
CREATE INDEX idx_collaborations_status ON collaborations(status);
CREATE INDEX idx_collaborations_created_at ON collaborations(created_at DESC);

-- ============================================================================
-- Collaboration Members Table
-- ============================================================================
CREATE TABLE IF NOT EXISTS collaboration_members (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    collaboration_id UUID NOT NULL REFERENCES collaborations(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    role VARCHAR(50) NOT NULL DEFAULT 'member',
    permissions JSONB DEFAULT '{"read": true, "write": false, "admin": false}'::jsonb,
    joined_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    invited_by UUID REFERENCES users(id),
    status VARCHAR(50) NOT NULL DEFAULT 'active',
    UNIQUE(collaboration_id, user_id)
);

CREATE INDEX idx_collaboration_members_collab_id ON collaboration_members(collaboration_id);
CREATE INDEX idx_collaboration_members_user_id ON collaboration_members(user_id);
CREATE INDEX idx_collaboration_members_role ON collaboration_members(role);
CREATE INDEX idx_collaboration_members_status ON collaboration_members(status);

-- ============================================================================
-- Collaboration Documents Table (many-to-many)
-- ============================================================================
CREATE TABLE IF NOT EXISTS collaboration_documents (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    collaboration_id UUID NOT NULL REFERENCES collaborations(id) ON DELETE CASCADE,
    document_id UUID NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
    added_by UUID NOT NULL REFERENCES users(id),
    added_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    permissions JSONB DEFAULT '{"read": true, "write": false, "sign": false}'::jsonb,
    UNIQUE(collaboration_id, document_id)
);

CREATE INDEX idx_collaboration_documents_collab_id ON collaboration_documents(collaboration_id);
CREATE INDEX idx_collaboration_documents_doc_id ON collaboration_documents(document_id);
CREATE INDEX idx_collaboration_documents_added_by ON collaboration_documents(added_by);

-- ============================================================================
-- Files Table for Storage System
-- ============================================================================
CREATE TABLE IF NOT EXISTS files (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    filename VARCHAR(255) NOT NULL,
    original_filename VARCHAR(255) NOT NULL,
    file_path TEXT NOT NULL,
    file_size BIGINT NOT NULL,
    mime_type VARCHAR(100),
    file_hash VARCHAR(128), -- SHA-256 hash
    encryption_key_id UUID,
    is_encrypted BOOLEAN DEFAULT false,
    storage_provider VARCHAR(50) DEFAULT 'minio',
    bucket_name VARCHAR(100),
    object_key TEXT,
    uploaded_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_accessed_at TIMESTAMPTZ,
    metadata JSONB DEFAULT '{}'::jsonb,
    tags TEXT[] DEFAULT '{}',
    status VARCHAR(50) NOT NULL DEFAULT 'active'
);

CREATE INDEX idx_files_user_id ON files(user_id);
CREATE INDEX idx_files_filename ON files(filename);
CREATE INDEX idx_files_file_hash ON files(file_hash);
CREATE INDEX idx_files_uploaded_at ON files(uploaded_at DESC);
CREATE INDEX idx_files_mime_type ON files(mime_type);
CREATE INDEX idx_files_tags ON files USING GIN(tags);
CREATE INDEX idx_files_status ON files(status);

-- ============================================================================
-- Activity Log Table for Real Activity Tracking
-- ============================================================================
CREATE TABLE IF NOT EXISTS activity_log (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    action VARCHAR(100) NOT NULL,
    entity_type VARCHAR(50),
    entity_id UUID,
    entity_name VARCHAR(255),
    ip_address INET,
    user_agent TEXT,
    session_id VARCHAR(128),
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_activity_log_user_id ON activity_log(user_id);
CREATE INDEX idx_activity_log_action ON activity_log(action);
CREATE INDEX idx_activity_log_entity_type ON activity_log(entity_type);
CREATE INDEX idx_activity_log_entity_id ON activity_log(entity_id);
CREATE INDEX idx_activity_log_created_at ON activity_log(created_at DESC);
CREATE INDEX idx_activity_log_session_id ON activity_log(session_id);

-- ============================================================================
-- Update triggers for updated_at columns
-- ============================================================================
CREATE TRIGGER update_collaborations_updated_at 
    BEFORE UPDATE ON collaborations
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- Sample data for development
-- ============================================================================
-- Insert sample collaboration (only if no collaborations exist)
INSERT INTO collaborations (name, description, owner_id)
SELECT 
    'Sample Project Collaboration',
    'A sample collaboration for testing and development',
    id
FROM users 
WHERE email = 'test@oxsig.local' OR display_name = 'Test User'
LIMIT 1
ON CONFLICT DO NOTHING;

COMMENT ON TABLE collaborations IS 'Real-time collaboration spaces for document sharing and signing';
COMMENT ON TABLE collaboration_members IS 'Users participating in collaborations with their roles and permissions';
COMMENT ON TABLE collaboration_documents IS 'Documents shared within collaborations';
COMMENT ON TABLE files IS 'File storage metadata with encryption and storage provider information';
COMMENT ON TABLE activity_log IS 'Comprehensive activity tracking for audit and analytics';