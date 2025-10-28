-- Migration: Add user_crypto_keys and paired_devices tables
-- Created: 2025-10-28

-- Create user_crypto_keys table for storing user cryptographic keys
CREATE TABLE IF NOT EXISTS user_crypto_keys (
  id BIGSERIAL PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  key_type VARCHAR(50) NOT NULL DEFAULT 'signing', -- signing, encryption, recovery, backup
  algorithm VARCHAR(100) NOT NULL, -- Ed25519, CRYSTALS-Dilithium, SPHINCS+, RSA-4096
  public_key TEXT NOT NULL,
  private_key_encrypted TEXT, -- Encrypted private key (if stored server-side)
  status VARCHAR(20) NOT NULL DEFAULT 'active', -- active, backup, deprecated, revoked
  usage_count INTEGER DEFAULT 0,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMP,
  metadata JSONB DEFAULT '{}'::jsonb
);

-- Create indexes for user_crypto_keys
CREATE INDEX IF NOT EXISTS idx_user_crypto_keys_user_id ON user_crypto_keys(user_id);
CREATE INDEX IF NOT EXISTS idx_user_crypto_keys_status ON user_crypto_keys(status);
CREATE INDEX IF NOT EXISTS idx_user_crypto_keys_key_type ON user_crypto_keys(key_type);

-- Create paired_devices table if it doesn't exist
CREATE TABLE IF NOT EXISTS paired_devices (
  id VARCHAR(255) PRIMARY KEY,
  user_did TEXT NOT NULL,
  device_pub_key TEXT NOT NULL,
  device_did TEXT NOT NULL,
  device_info JSONB DEFAULT '{}'::jsonb,
  paired_at TIMESTAMP NOT NULL DEFAULT NOW(),
  last_seen TIMESTAMP NOT NULL DEFAULT NOW(),
  trusted BOOLEAN DEFAULT true,
  metadata JSONB DEFAULT '{}'::jsonb
);

-- Create indexes for paired_devices
CREATE INDEX IF NOT EXISTS idx_paired_devices_user_did ON paired_devices(user_did);
CREATE INDEX IF NOT EXISTS idx_paired_devices_last_seen ON paired_devices(last_seen);

-- Add comments
COMMENT ON TABLE user_crypto_keys IS 'Stores user cryptographic key pairs for signing and encryption';
COMMENT ON TABLE paired_devices IS 'Stores paired devices for multi-device support';
