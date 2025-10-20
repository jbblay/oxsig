-- Initial schema for OxSig platform
-- Create extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Users table
CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    public_key TEXT NOT NULL UNIQUE,
    display_name VARCHAR(255),
    avatar_url TEXT,
    bio TEXT,
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    last_seen_at TIMESTAMP WITH TIME ZONE,
    is_active BOOLEAN DEFAULT TRUE
);

CREATE INDEX idx_users_public_key ON users(public_key);
CREATE INDEX idx_users_created_at ON users(created_at);

-- Sessions table
CREATE TABLE sessions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token TEXT NOT NULL UNIQUE,
    device_info JSONB DEFAULT '{}',
    ip_address INET,
    user_agent TEXT,
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    last_activity_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_sessions_user_id ON sessions(user_id);
CREATE INDEX idx_sessions_token ON sessions(token);
CREATE INDEX idx_sessions_expires_at ON sessions(expires_at);

-- Documents table
CREATE TABLE documents (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    owner_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    title VARCHAR(500) NOT NULL,
    content TEXT,
    content_hash TEXT,
    mime_type VARCHAR(100),
    file_size BIGINT,
    storage_key TEXT, -- MinIO/IPFS key
    ipfs_cid TEXT,
    encryption_metadata JSONB,
    metadata JSONB DEFAULT '{}',
    version INTEGER DEFAULT 1,
    parent_id UUID REFERENCES documents(id),
    is_deleted BOOLEAN DEFAULT FALSE,
    deleted_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_documents_owner_id ON documents(owner_id);
CREATE INDEX idx_documents_content_hash ON documents(content_hash);
CREATE INDEX idx_documents_ipfs_cid ON documents(ipfs_cid);
CREATE INDEX idx_documents_parent_id ON documents(parent_id);
CREATE INDEX idx_documents_created_at ON documents(created_at);

-- Signatures table
CREATE TABLE signatures (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    document_id UUID NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
    signer_id UUID NOT NULL REFERENCES users(id),
    signature_data TEXT NOT NULL, -- Base64 encoded signature
    signature_algorithm VARCHAR(50) NOT NULL, -- e.g., 'ed25519'
    public_key TEXT NOT NULL,
    timestamp TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    metadata JSONB DEFAULT '{}',
    is_valid BOOLEAN DEFAULT TRUE,
    revoked_at TIMESTAMP WITH TIME ZONE,
    revocation_reason TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_signatures_document_id ON signatures(document_id);
CREATE INDEX idx_signatures_signer_id ON signatures(signer_id);
CREATE INDEX idx_signatures_timestamp ON signatures(timestamp);

-- Consent records
CREATE TABLE consent_records (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    resource_id UUID, -- Generic reference to any resource
    resource_type VARCHAR(100) NOT NULL, -- 'document', 'data_access', etc.
    consent_type VARCHAR(100) NOT NULL, -- 'read', 'write', 'share', etc.
    granted BOOLEAN NOT NULL,
    grantor_id UUID REFERENCES users(id), -- Who gave the consent
    grantee_id UUID REFERENCES users(id), -- Who received the consent
    expires_at TIMESTAMP WITH TIME ZONE,
    scope JSONB DEFAULT '{}',
    conditions JSONB DEFAULT '{}',
    metadata JSONB DEFAULT '{}',
    revoked_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_consent_user_id ON consent_records(user_id);
CREATE INDEX idx_consent_resource ON consent_records(resource_id, resource_type);
CREATE INDEX idx_consent_grantor ON consent_records(grantor_id);
CREATE INDEX idx_consent_grantee ON consent_records(grantee_id);

-- Audit log
CREATE TABLE audit_log (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES users(id),
    action VARCHAR(100) NOT NULL,
    resource_type VARCHAR(100) NOT NULL,
    resource_id UUID,
    details JSONB DEFAULT '{}',
    ip_address INET,
    user_agent TEXT,
    session_id UUID REFERENCES sessions(id),
    success BOOLEAN DEFAULT TRUE,
    error_message TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_audit_user_id ON audit_log(user_id);
CREATE INDEX idx_audit_action ON audit_log(action);
CREATE INDEX idx_audit_resource ON audit_log(resource_type, resource_id);
CREATE INDEX idx_audit_created_at ON audit_log(created_at);

-- Rooms for collaboration
CREATE TABLE rooms (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) NOT NULL,
    owner_id UUID NOT NULL REFERENCES users(id),
    room_type VARCHAR(50) DEFAULT 'collaboration', -- 'collaboration', 'signature', 'chat'
    is_public BOOLEAN DEFAULT FALSE,
    max_participants INTEGER,
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    closed_at TIMESTAMP WITH TIME ZONE
);

CREATE INDEX idx_rooms_owner_id ON rooms(owner_id);
CREATE INDEX idx_rooms_type ON rooms(room_type);

-- Room participants
CREATE TABLE room_participants (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    room_id UUID NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id),
    role VARCHAR(50) DEFAULT 'participant', -- 'owner', 'moderator', 'participant'
    joined_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    left_at TIMESTAMP WITH TIME ZONE,
    UNIQUE(room_id, user_id)
);

CREATE INDEX idx_room_participants_room ON room_participants(room_id);
CREATE INDEX idx_room_participants_user ON room_participants(user_id);

-- Device pairing
CREATE TABLE device_pairs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id),
    device_1_id TEXT NOT NULL,
    device_2_id TEXT NOT NULL,
    pairing_code TEXT,
    public_key_1 TEXT,
    public_key_2 TEXT,
    status VARCHAR(50) DEFAULT 'pending', -- 'pending', 'active', 'expired', 'revoked'
    paired_at TIMESTAMP WITH TIME ZONE,
    expires_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_device_pairs_user ON device_pairs(user_id);
CREATE INDEX idx_device_pairs_status ON device_pairs(status);

-- Encrypted vault items
CREATE TABLE vault_items (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    item_type VARCHAR(100) NOT NULL, -- 'password', 'note', 'identity', 'card'
    title VARCHAR(500),
    encrypted_data TEXT NOT NULL, -- Encrypted JSON blob
    encryption_metadata JSONB NOT NULL,
    tags TEXT[],
    folder VARCHAR(255),
    favorite BOOLEAN DEFAULT FALSE,
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    accessed_at TIMESTAMP WITH TIME ZONE
);

CREATE INDEX idx_vault_user_id ON vault_items(user_id);
CREATE INDEX idx_vault_item_type ON vault_items(item_type);
CREATE INDEX idx_vault_tags ON vault_items USING GIN(tags);

-- Shared documents (permissions)
CREATE TABLE document_shares (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    document_id UUID NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
    owner_id UUID NOT NULL REFERENCES users(id),
    shared_with_id UUID REFERENCES users(id),
    share_link TEXT UNIQUE,
    permission_level VARCHAR(50) NOT NULL, -- 'view', 'comment', 'edit', 'sign'
    expires_at TIMESTAMP WITH TIME ZONE,
    password_hash TEXT,
    access_count INTEGER DEFAULT 0,
    max_access_count INTEGER,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    revoked_at TIMESTAMP WITH TIME ZONE
);

CREATE INDEX idx_document_shares_document ON document_shares(document_id);
CREATE INDEX idx_document_shares_owner ON document_shares(owner_id);
CREATE INDEX idx_document_shares_shared_with ON document_shares(shared_with_id);
CREATE INDEX idx_document_shares_link ON document_shares(share_link);

-- P2P connections tracking
CREATE TABLE peer_connections (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_1_id UUID NOT NULL REFERENCES users(id),
    user_2_id UUID NOT NULL REFERENCES users(id),
    connection_type VARCHAR(50) NOT NULL, -- 'webrtc', 'websocket'
    status VARCHAR(50) DEFAULT 'connecting', -- 'connecting', 'connected', 'disconnected'
    signaling_data JSONB,
    established_at TIMESTAMP WITH TIME ZONE,
    disconnected_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_peer_connections_users ON peer_connections(user_1_id, user_2_id);
CREATE INDEX idx_peer_connections_status ON peer_connections(status);

-- Notification queue
CREATE TABLE notifications (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    type VARCHAR(100) NOT NULL,
    title VARCHAR(500),
    message TEXT,
    data JSONB DEFAULT '{}',
    read BOOLEAN DEFAULT FALSE,
    read_at TIMESTAMP WITH TIME ZONE,
    action_url TEXT,
    expires_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_notifications_user ON notifications(user_id);
CREATE INDEX idx_notifications_read ON notifications(user_id, read);
CREATE INDEX idx_notifications_created ON notifications(created_at);

-- Functions
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Triggers
CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON users
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_documents_updated_at BEFORE UPDATE ON documents
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_consent_updated_at BEFORE UPDATE ON consent_records
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_vault_updated_at BEFORE UPDATE ON vault_items
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
