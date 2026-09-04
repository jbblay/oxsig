-- Structured Oxsig Knowledge Vault.
--
-- The Vault deliberately stores reusable technical knowledge objects rather
-- than arbitrary user file uploads. Large binary assets remain feature-owned
-- by Boards, Collaboration, and Cyber Lab infrastructure.

CREATE TABLE IF NOT EXISTS vault_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    owner_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    kind VARCHAR(32) NOT NULL,
    title VARCHAR(160) NOT NULL,
    summary VARCHAR(500) NOT NULL DEFAULT '',
    body TEXT NOT NULL DEFAULT '',
    language VARCHAR(64),
    tags TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    pinned BOOLEAN NOT NULL DEFAULT false,
    archived BOOLEAN NOT NULL DEFAULT false,
    source_type VARCHAR(32),
    source_id TEXT,
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT vault_items_kind_check CHECK (
        kind IN ('command', 'procedure', 'cheat_sheet', 'script', 'concept', 'playbook')
    ),
    CONSTRAINT vault_items_source_type_check CHECK (
        source_type IS NULL OR source_type IN ('manual', 'collaboration', 'board', 'lab')
    )
);

CREATE INDEX IF NOT EXISTS idx_vault_items_owner_updated
    ON vault_items(owner_id, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_vault_items_owner_kind
    ON vault_items(owner_id, kind);

CREATE INDEX IF NOT EXISTS idx_vault_items_owner_pinned
    ON vault_items(owner_id, pinned)
    WHERE archived = false;

CREATE INDEX IF NOT EXISTS idx_vault_items_tags
    ON vault_items USING GIN(tags);

COMMENT ON TABLE vault_items IS 'Reusable structured technical knowledge stored in the Oxsig Vault';
COMMENT ON COLUMN vault_items.kind IS 'Knowledge object type: command, procedure, cheat_sheet, script, concept, or playbook';
COMMENT ON COLUMN vault_items.source_type IS 'Optional Oxsig feature that produced the knowledge object';
