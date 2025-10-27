-- Migration 008: WebAuthn/FIDO2 Credentials
-- Phishing-resistant hardware authentication
-- Supports YubiKey, Touch ID, Windows Hello, etc.

-- WebAuthn credentials table
CREATE TABLE IF NOT EXISTS webauthn_credentials (
  id VARCHAR(255) PRIMARY KEY, -- Base64URL-encoded credential ID
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  public_key TEXT NOT NULL, -- PEM or JWK format
  counter BIGINT NOT NULL DEFAULT 0, -- Sign count for cloned device detection
  aaguid UUID, -- Authenticator Attestation GUID
  credential_type VARCHAR(50) NOT NULL DEFAULT 'public-key',
  transports JSONB DEFAULT '[]'::jsonb, -- ["usb", "nfc", "ble", "internal"]
  attestation_format VARCHAR(50), -- "packed", "fido-u2f", "android-key", etc.
  attestation_object TEXT, -- Full attestation object for verification
  user_verified BOOLEAN DEFAULT false, -- UV flag from authenticator
  backup_eligible BOOLEAN DEFAULT false, -- BE flag
  backup_state BOOLEAN DEFAULT false, -- BS flag
  device_name VARCHAR(255), -- User-friendly name (e.g., "YubiKey 5")
  last_used_at TIMESTAMP,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
  CONSTRAINT fk_webauthn_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- WebAuthn challenges table (for registration & authentication)
CREATE TABLE IF NOT EXISTS webauthn_challenges (
  id VARCHAR(255) PRIMARY KEY, -- Base64URL-encoded challenge
  user_id UUID REFERENCES users(id) ON DELETE CASCADE, -- NULL for registration
  email VARCHAR(255), -- For registration flow
  challenge_type VARCHAR(20) NOT NULL, -- "registration" or "authentication"
  expires_at TIMESTAMP NOT NULL,
  used_at TIMESTAMP, -- Mark as used to prevent replay
  ip_address INET,
  user_agent TEXT,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX idx_webauthn_credentials_user ON webauthn_credentials(user_id);
CREATE INDEX idx_webauthn_credentials_last_used ON webauthn_credentials(last_used_at DESC);
CREATE INDEX idx_webauthn_challenges_user ON webauthn_challenges(user_id);
CREATE INDEX idx_webauthn_challenges_email ON webauthn_challenges(email);
CREATE INDEX idx_webauthn_challenges_expires ON webauthn_challenges(expires_at);
CREATE INDEX idx_webauthn_challenges_type ON webauthn_challenges(challenge_type);

-- Cleanup function for expired challenges
CREATE OR REPLACE FUNCTION cleanup_expired_webauthn_challenges()
RETURNS void AS $$
BEGIN
  DELETE FROM webauthn_challenges
  WHERE expires_at < NOW() - INTERVAL '1 hour';
END;
$$ LANGUAGE plpgsql;

-- Comments
COMMENT ON TABLE webauthn_credentials IS 'FIDO2/WebAuthn hardware security keys (YubiKey, Touch ID, etc.)';
COMMENT ON TABLE webauthn_challenges IS 'Temporary challenges for WebAuthn registration/authentication';
COMMENT ON COLUMN webauthn_credentials.counter IS 'Sign counter for detecting cloned authenticators';
COMMENT ON COLUMN webauthn_credentials.aaguid IS 'Authenticator Attestation GUID - identifies authenticator model';
COMMENT ON COLUMN webauthn_credentials.transports IS 'How authenticator connects: usb, nfc, ble, internal';
COMMENT ON COLUMN webauthn_credentials.user_verified IS 'Whether user verification (PIN/biometric) was performed';
COMMENT ON COLUMN webauthn_credentials.backup_eligible IS 'Can credential be backed up (synced across devices)';
COMMENT ON COLUMN webauthn_credentials.backup_state IS 'Is credential currently backed up';
COMMENT ON COLUMN webauthn_challenges.challenge_type IS 'registration or authentication';

