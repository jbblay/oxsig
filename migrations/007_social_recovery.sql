-- Migration 007: Social Recovery System
-- OPSEC-focused account recovery using Shamir's Secret Sharing
-- No email, no phone - only cryptographic proofs and trusted guardians

-- Recovery packages table
CREATE TABLE IF NOT EXISTS recovery_packages (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  config JSONB NOT NULL, -- RecoveryConfig: threshold, totalGuardians, timeLock, sessionExpiry
  guardians JSONB NOT NULL, -- Array of Guardian objects with encrypted shares
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Recovery sessions table
CREATE TABLE IF NOT EXISTS recovery_sessions (
  id VARCHAR(32) PRIMARY KEY, -- UUID
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  initiated_at TIMESTAMP NOT NULL DEFAULT NOW(),
  can_complete_at TIMESTAMP NOT NULL, -- Time lock
  threshold INTEGER NOT NULL,
  expires_at TIMESTAMP NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'pending', -- pending, time-locked, ready, completed, expired, cancelled
  collected_shares_count INTEGER DEFAULT 0,
  responded_guardians JSONB DEFAULT '[]'::jsonb, -- Array of guardian DIDs
  updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMP
);

-- Recovery session shares (stored separately for security)
CREATE TABLE IF NOT EXISTS recovery_session_shares (
  session_id VARCHAR(32) PRIMARY KEY REFERENCES recovery_sessions(id) ON DELETE CASCADE,
  shares JSONB NOT NULL -- Array of ShamirShare objects
);

-- Indexes for performance
CREATE INDEX idx_recovery_packages_user ON recovery_packages(user_id);
CREATE INDEX idx_recovery_sessions_user ON recovery_sessions(user_id);
CREATE INDEX idx_recovery_sessions_status ON recovery_sessions(status);
CREATE INDEX idx_recovery_sessions_expires ON recovery_sessions(expires_at);

-- Comments
COMMENT ON TABLE recovery_packages IS 'User recovery configurations with guardian shares';
COMMENT ON TABLE recovery_sessions IS 'Active recovery sessions';
COMMENT ON TABLE recovery_session_shares IS 'Collected shares for recovery sessions';
COMMENT ON COLUMN recovery_packages.config IS 'JSON: threshold, totalGuardians, timeLock, sessionExpiry';
COMMENT ON COLUMN recovery_packages.guardians IS 'JSON array: Guardian objects with encrypted shares';
COMMENT ON COLUMN recovery_sessions.can_complete_at IS 'Recovery cannot complete before this time (time lock for security)';
COMMENT ON COLUMN recovery_sessions.responded_guardians IS 'JSON array: DIDs of guardians who submitted shares';
