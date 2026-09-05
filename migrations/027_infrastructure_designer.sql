-- Durable per-user Infrastructure Designer document.
-- This stores design intent separately from the live Cyber Lab runtime topology so
-- a later deployment compiler can validate and translate the design explicitly.

CREATE TABLE IF NOT EXISTS infrastructure_designs (
    owner_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    design JSONB NOT NULL DEFAULT '{"version":1,"nodes":[],"edges":[]}'::jsonb,
    schema_version INTEGER NOT NULL DEFAULT 1 CHECK (schema_version = 1),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_infrastructure_designs_updated_at
    ON infrastructure_designs(updated_at DESC);
