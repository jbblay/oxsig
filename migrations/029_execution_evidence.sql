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

-- Controlled deployment execution already emits this event only after the trusted
-- AWS runtime adapter returns the provider allocation. Capture that existing
-- server-generated event as provider-attested evidence so runtime provisioning
-- and evidence persistence share one failure boundary.
CREATE OR REPLACE FUNCTION capture_deployment_execution_evidence()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
    v_owner_id UUID;
    v_authorization_id UUID;
    v_execution_id UUID;
    v_execution_started_at TIMESTAMPTZ;
BEGIN
    IF NEW.event_type <> 'deployment_execution_started' THEN
        RETURN NEW;
    END IF;

    v_authorization_id := NULLIF(NEW.payload->>'authorizationId', '')::UUID;
    v_execution_id := NULLIF(NEW.payload->>'executionId', '')::UUID;

    IF v_authorization_id IS NULL OR v_execution_id IS NULL THEN
        RAISE EXCEPTION 'deployment execution evidence event is missing authorizationId or executionId';
    END IF;

    SELECT instance.owner_id
      INTO v_owner_id
      FROM lab_instances instance
     WHERE instance.id = NEW.lab_instance_id;

    IF v_owner_id IS NULL THEN
        RAISE EXCEPTION 'deployment execution evidence could not resolve lab owner';
    END IF;

    SELECT authorization.execution_started_at
      INTO v_execution_started_at
      FROM deployment_authorizations authorization
     WHERE authorization.id = v_authorization_id
       AND authorization.owner_id = v_owner_id
       AND authorization.execution_id = v_execution_id
       AND authorization.lab_instance_id = NEW.lab_instance_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'deployment execution evidence does not match the active authorization binding';
    END IF;

    INSERT INTO execution_evidence (
        owner_id,
        lab_instance_id,
        deployment_authorization_id,
        execution_id,
        source,
        surface,
        provenance,
        state,
        payload,
        execution_started_at,
        evidence_recorded_at
    ) VALUES (
        v_owner_id,
        NEW.lab_instance_id,
        v_authorization_id,
        v_execution_id,
        'deployment',
        'infrastructure-designer',
        'provider-attested',
        'evidence_recorded',
        NEW.payload || jsonb_build_object('labEventId', NEW.id),
        COALESCE(v_execution_started_at, NEW.created_at),
        NEW.created_at
    )
    ON CONFLICT (owner_id, execution_id) DO NOTHING;

    UPDATE deployment_authorizations
       SET state='evidence_recorded',
           evidence_recorded_at=COALESCE(evidence_recorded_at, NEW.created_at),
           updated_at=NOW()
     WHERE id = v_authorization_id
       AND owner_id = v_owner_id
       AND execution_id = v_execution_id
       AND lab_instance_id = NEW.lab_instance_id
       AND state='executing';

    IF NOT FOUND AND NOT EXISTS (
        SELECT 1
          FROM deployment_authorizations
         WHERE id = v_authorization_id
           AND owner_id = v_owner_id
           AND execution_id = v_execution_id
           AND lab_instance_id = NEW.lab_instance_id
           AND state IN ('evidence_recorded','analyzed')
    ) THEN
        RAISE EXCEPTION 'deployment authorization could not advance to evidence-recorded state';
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_capture_deployment_execution_evidence ON lab_events;
CREATE TRIGGER trg_capture_deployment_execution_evidence
AFTER INSERT ON lab_events
FOR EACH ROW
WHEN (NEW.event_type = 'deployment_execution_started')
EXECUTE FUNCTION capture_deployment_execution_evidence();

COMMENT ON TABLE execution_evidence IS
    'Execution Evidence Ledger with explicit provenance, one-time execution binding, and AI analysis lifecycle';
