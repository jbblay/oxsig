-- Add WebRTC pairing and session management tables

-- WebRTC Sessions table
CREATE TABLE IF NOT EXISTS webrtc_sessions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    session_id VARCHAR(255) UNIQUE NOT NULL,
    peer_id VARCHAR(255),
    status VARCHAR(50) NOT NULL DEFAULT 'active', -- active, closed, error
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expires_at TIMESTAMPTZ NOT NULL,
    metadata JSONB DEFAULT '{}'::jsonb
);

CREATE INDEX idx_webrtc_sessions_user_id ON webrtc_sessions(user_id);
CREATE INDEX idx_webrtc_sessions_status ON webrtc_sessions(status);
CREATE INDEX idx_webrtc_sessions_expires_at ON webrtc_sessions(expires_at);

-- Device pairing table
CREATE TABLE IF NOT EXISTS device_pairings (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    device_id VARCHAR(255) NOT NULL,
    device_name VARCHAR(255),
    public_key TEXT NOT NULL,
    challenge_hash VARCHAR(255),
    paired_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_used_at TIMESTAMPTZ,
    is_active BOOLEAN NOT NULL DEFAULT true,
    metadata JSONB DEFAULT '{}'::jsonb,
    UNIQUE(user_id, device_id)
);

CREATE INDEX idx_device_pairings_user_id ON device_pairings(user_id);
CREATE INDEX idx_device_pairings_device_id ON device_pairings(device_id);
CREATE INDEX idx_device_pairings_active ON device_pairings(is_active);
