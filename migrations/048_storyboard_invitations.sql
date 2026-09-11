-- Durable Storyboard invitations for recipients who do not yet have an OXSIG account.
-- Raw invitation tokens are never persisted; only SHA-256 hashes are stored.

CREATE TABLE IF NOT EXISTS storyboard_invitations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id UUID NOT NULL REFERENCES storyboard_sessions(id) ON DELETE CASCADE,
    email VARCHAR(320) NOT NULL,
    permission VARCHAR(16) NOT NULL CHECK (permission IN ('viewer', 'editor')),
    token_hash CHAR(64) NOT NULL UNIQUE,
    status VARCHAR(16) NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending', 'accepted', 'revoked', 'expired')),
    invited_by UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    accepted_by UUID REFERENCES users(id) ON DELETE SET NULL,
    provider VARCHAR(32),
    provider_message_id VARCHAR(255),
    delivery_status VARCHAR(32) NOT NULL DEFAULT 'not_configured',
    delivery_error TEXT,
    expires_at TIMESTAMPTZ NOT NULL,
    accepted_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_storyboard_invitations_pending_email
    ON storyboard_invitations(session_id, lower(email))
    WHERE status = 'pending';

CREATE INDEX IF NOT EXISTS idx_storyboard_invitations_email
    ON storyboard_invitations(lower(email), created_at DESC);

CREATE INDEX IF NOT EXISTS idx_storyboard_invitations_expires
    ON storyboard_invitations(expires_at)
    WHERE status = 'pending';

COMMENT ON TABLE storyboard_invitations IS
    'Expiring email invitations that become Storyboard viewer/editor grants after the recipient signs in.';
