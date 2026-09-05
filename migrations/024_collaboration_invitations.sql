-- Durable collaboration invitations for people who have not signed in yet.
-- Raw invitation tokens are never stored; only SHA-256 hashes are persisted.

CREATE TABLE IF NOT EXISTS collaboration_invitations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    collaboration_id UUID NOT NULL REFERENCES collaborations(id) ON DELETE CASCADE,
    email VARCHAR(320) NOT NULL,
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

CREATE UNIQUE INDEX IF NOT EXISTS idx_collaboration_invitations_pending_email
    ON collaboration_invitations(collaboration_id, lower(email))
    WHERE status = 'pending';

CREATE INDEX IF NOT EXISTS idx_collaboration_invitations_email
    ON collaboration_invitations(lower(email), created_at DESC);

CREATE INDEX IF NOT EXISTS idx_collaboration_invitations_expires
    ON collaboration_invitations(expires_at)
    WHERE status = 'pending';

COMMENT ON TABLE collaboration_invitations IS 'Secure expiring invitations for collaboration recipients who may not yet have an OXSIG account';