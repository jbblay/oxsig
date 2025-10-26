-- Collaboration System Migration
-- Adds tables for real-time collaboration features

-- ============================================================================
-- Collaborations Table
-- ============================================================================
CREATE TABLE IF NOT EXISTS collaborations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) NOT NULL,
    description TEXT,
    owner_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    status VARCHAR(50) NOT NULL DEFAULT 'active',
    collaboration_type VARCHAR(50) DEFAULT 'document',
    settings JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expires_at TIMESTAMPTZ,
    metadata JSONB DEFAULT '{}'::jsonb
);

CREATE INDEX idx_collaborations_owner_id ON collaborations(owner_id);
CREATE INDEX idx_collaborations_status ON collaborations(status);
CREATE INDEX idx_collaborations_created_at ON collaborations(created_at DESC);
CREATE INDEX idx_collaborations_type ON collaborations(collaboration_type);

-- ============================================================================
-- Collaboration Members Table
-- ============================================================================
CREATE TABLE IF NOT EXISTS collaboration_members (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    collaboration_id UUID NOT NULL REFERENCES collaborations(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    role VARCHAR(50) NOT NULL DEFAULT 'member',
    permissions JSONB DEFAULT '{"read": true, "write": false, "admin": false}'::jsonb,
    status VARCHAR(50) NOT NULL DEFAULT 'active',
    invited_by UUID REFERENCES users(id),
    joined_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_active_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(collaboration_id, user_id)
);

CREATE INDEX idx_collaboration_members_collab_id ON collaboration_members(collaboration_id);
CREATE INDEX idx_collaboration_members_user_id ON collaboration_members(user_id);
CREATE INDEX idx_collaboration_members_role ON collaboration_members(role);
CREATE INDEX idx_collaboration_members_status ON collaboration_members(status);

-- ============================================================================
-- Collaboration Documents Table (Links documents to collaborations)
-- ============================================================================
CREATE TABLE IF NOT EXISTS collaboration_documents (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    collaboration_id UUID NOT NULL REFERENCES collaborations(id) ON DELETE CASCADE,
    document_id UUID NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
    added_by UUID NOT NULL REFERENCES users(id),
    added_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(collaboration_id, document_id)
);

CREATE INDEX idx_collaboration_documents_collab_id ON collaboration_documents(collaboration_id);
CREATE INDEX idx_collaboration_documents_doc_id ON collaboration_documents(document_id);

-- ============================================================================
-- WebRTC Sessions Table (For real-time collaboration)
-- ============================================================================
CREATE TABLE IF NOT EXISTS webrtc_sessions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    collaboration_id UUID NOT NULL REFERENCES collaborations(id) ON DELETE CASCADE,
    initiator_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    peer_id UUID REFERENCES users(id) ON DELETE CASCADE,
    session_type VARCHAR(50) NOT NULL DEFAULT 'data', -- 'data', 'audio', 'video'
    status VARCHAR(50) NOT NULL DEFAULT 'initiated',
    ice_candidates JSONB DEFAULT '[]'::jsonb,
    sdp_offer TEXT,
    sdp_answer TEXT,
    connection_quality JSONB DEFAULT '{}'::jsonb,
    started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    ended_at TIMESTAMPTZ,
    metadata JSONB DEFAULT '{}'::jsonb
);

CREATE INDEX idx_webrtc_sessions_collab_id ON webrtc_sessions(collaboration_id);
CREATE INDEX idx_webrtc_sessions_initiator_id ON webrtc_sessions(initiator_id);
CREATE INDEX idx_webrtc_sessions_status ON webrtc_sessions(status);
CREATE INDEX idx_webrtc_sessions_started_at ON webrtc_sessions(started_at DESC);

-- ============================================================================
-- Collaboration Activity Log
-- ============================================================================
CREATE TABLE IF NOT EXISTS collaboration_activity (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    collaboration_id UUID NOT NULL REFERENCES collaborations(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    activity_type VARCHAR(100) NOT NULL,
    activity_data JSONB DEFAULT '{}'::jsonb,
    document_id UUID REFERENCES documents(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_collaboration_activity_collab_id ON collaboration_activity(collaboration_id);
CREATE INDEX idx_collaboration_activity_user_id ON collaboration_activity(user_id);
CREATE INDEX idx_collaboration_activity_type ON collaboration_activity(activity_type);
CREATE INDEX idx_collaboration_activity_created_at ON collaboration_activity(created_at DESC);

-- ============================================================================
-- Files Table (For file storage with MinIO integration)
-- ============================================================================
CREATE TABLE IF NOT EXISTS files (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    filename VARCHAR(255) NOT NULL,
    original_filename VARCHAR(255) NOT NULL,
    file_path TEXT NOT NULL, -- MinIO path
    file_size BIGINT NOT NULL,
    mime_type VARCHAR(100),
    file_hash VARCHAR(64), -- SHA-256 hash
    encryption_key_id UUID,
    is_encrypted BOOLEAN DEFAULT false,
    bucket_name VARCHAR(63) DEFAULT 'oxsig-files',
    folder_path TEXT DEFAULT '',
    tags TEXT[] DEFAULT '{}',
    upload_status VARCHAR(50) DEFAULT 'completed',
    uploaded_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_accessed_at TIMESTAMPTZ DEFAULT NOW(),
    metadata JSONB DEFAULT '{}'::jsonb
);

CREATE INDEX idx_files_user_id ON files(user_id);
CREATE INDEX idx_files_filename ON files(filename);
CREATE INDEX idx_files_file_hash ON files(file_hash);
CREATE INDEX idx_files_mime_type ON files(mime_type);
CREATE INDEX idx_files_uploaded_at ON files(uploaded_at DESC);
CREATE INDEX idx_files_upload_status ON files(upload_status);
CREATE INDEX idx_files_tags ON files USING GIN(tags);

-- ============================================================================
-- File Shares Table (For file sharing permissions)
-- ============================================================================
CREATE TABLE IF NOT EXISTS file_shares (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    file_id UUID NOT NULL REFERENCES files(id) ON DELETE CASCADE,
    shared_with_user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    shared_by_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    collaboration_id UUID REFERENCES collaborations(id) ON DELETE CASCADE,
    permission VARCHAR(20) NOT NULL DEFAULT 'view',
    expires_at TIMESTAMPTZ,
    share_token VARCHAR(64), -- For public shares
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_accessed_at TIMESTAMPTZ
);

CREATE INDEX idx_file_shares_file_id ON file_shares(file_id);
CREATE INDEX idx_file_shares_shared_with ON file_shares(shared_with_user_id);
CREATE INDEX idx_file_shares_shared_by ON file_shares(shared_by_user_id);
CREATE INDEX idx_file_shares_collab_id ON file_shares(collaboration_id);
CREATE INDEX idx_file_shares_token ON file_shares(share_token) WHERE share_token IS NOT NULL;

-- ============================================================================
-- Triggers for updated_at timestamps
-- ============================================================================
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_collaborations_updated_at 
    BEFORE UPDATE ON collaborations
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- Insert sample data for development
-- ============================================================================
-- This will be ignored if users don't exist
INSERT INTO collaborations (name, description, owner_id, collaboration_type) 
SELECT 
    'Test Collaboration',
    'A sample collaboration for testing real-time features',
    id,
    'document'
FROM users 
WHERE email = 'test@example.com'
ON CONFLICT DO NOTHING;

COMMENT ON TABLE collaborations IS 'Real-time collaboration sessions for document editing and review';
COMMENT ON TABLE collaboration_members IS 'Users participating in collaborations with their roles and permissions';
COMMENT ON TABLE collaboration_documents IS 'Documents associated with specific collaborations';
COMMENT ON TABLE webrtc_sessions IS 'WebRTC peer-to-peer connection sessions for real-time communication';
COMMENT ON TABLE files IS 'File metadata with MinIO storage integration';
COMMENT ON TABLE file_shares IS 'File sharing permissions and access control';