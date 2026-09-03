-- Shared API rate-limit buckets.
-- Oxsig server instances coordinate through PostgreSQL so limits survive
-- serverless cold starts and apply consistently across horizontally scaled
-- application instances. Only SHA-256 bucket identifiers are stored.

CREATE TABLE IF NOT EXISTS rate_limit_buckets (
  key_hash CHAR(64) PRIMARY KEY,
  request_count INTEGER NOT NULL CHECK (request_count >= 0),
  reset_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_rate_limit_buckets_reset_at
ON rate_limit_buckets(reset_at);

COMMENT ON TABLE rate_limit_buckets IS
  'Shared fixed-window API rate limits. key_hash is a SHA-256 digest; raw user/IP identifiers are not persisted.';
