-- Server-authoritative execution evidence ledger.
--
-- Evidence provenance is explicit. Browser-observed terminal evidence is genuine
-- UI-observed output but is not provider/server attestation. Provider-attested
-- evidence is written only by trusted Oxsig runtime adapters.

CREATE TABLE IF NOT EXISTS execution_evidence (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    owner_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    lab_instance_id UUID REFERENCES lab_instances(id) ON DELETE SET NULL,
    deployment_authorization_id UUID REFERENCES deployment_authorizations(id) ON DELETE SET NULL,
    execution_id UUID NOT NULL,
    source VARCHAR(32) NOT NULL
        CHECK (source IN ('interactive-terminal','deployment')),
    surface VARCHAR(48) NOT NULL,
    provenance VARCHAR(32) NOT NULL
        CHECK (provenance IN ('browser-observed','server-executed','provider-attested','learner-provided')),
    state VARCHAR(32) NOT NULL DEFAULT 'authorized'
        CHECK (state IN ('authorized','executing','evidence_recorded','analyzed','failed','expired')),
    command_hash CHAR(64),
    command TEXT,
    stdout TEXT,
    stderr TEXT,
    exit_code INTEGER,
    payload JSONB NOT NULL DEFAULT '{}'::jsonb,
    analysis_kind VARCHAR(32),
    analysis JSONB,
    model VARCHAR(128),
    expires_at TIMESTAMPTZ,
    execution_started_at TIMESTAMPTZ,
    evidence_recorded_at TIMESTAMPTZ,
    analyzed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CHECK ((command_hash IS NULL AND command IS NULL) OR (command_hash IS NOT NULL AND command IS NOT NULL)),
    CHECK (command_hash IS NULL OR command_hash ~ '^[0-9a-f]{64}$'),
    CHECK (exit_code IS NULL OR (exit_code >= -1 AND exit_code <= 255)),
    CHECK (expires_at IS NULL OR expires_at > created_at),
    CHECK (state NOT IN ('evidence_recorded','analyzed') OR evidence_recorded_at IS NOT NULL)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_execution_evidence_owner_execution
    ON execution_evidence(owner_id, execution_id);

CREATE INDEX IF NOT EXISTS idx_execution_evidence_owner_created
    ON execution_evidence(owner_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_execution_evidence_lab_created
    ON execution_evidence(lab_instance_id, created_at DESC)
    WHERE lab_instance_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_execution_evidence_deployment_created
    ON execution_evidence(deployment_authorization_id, created_at DESC)
    WHERE deployment_authorization_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_execution_evidence_terminal_lookup
    ON execution_evidence(owner_id, lab_instance_id, command_hash, created_at DESC)
    WHERE source='interactive-terminal';

COMMENT ON TABLE execution_evidence IS
    'Execution Evidence Ledger with explicit provenance, one-time execution binding, and AI analysis lifecycle';
