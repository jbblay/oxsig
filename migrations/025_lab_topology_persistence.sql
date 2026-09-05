-- Durable per-user Cyber Lab topology state.
-- PostgreSQL is the source of truth; browser localStorage remains only a compatibility/cache layer.

CREATE TABLE IF NOT EXISTS lab_topologies (
    owner_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    topology JSONB NOT NULL DEFAULT '{"nodes":[],"edges":[]}'::jsonb,
    schema_version INTEGER NOT NULL DEFAULT 1 CHECK (schema_version = 1),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_lab_topologies_updated_at
    ON lab_topologies(updated_at DESC);

COMMENT ON TABLE lab_topologies IS 'Durable owner-scoped Cyber Lab designer topology persisted independently of live AWS lab instances';
