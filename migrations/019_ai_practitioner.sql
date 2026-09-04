-- AI Practitioner learning and execution audit history.
-- The AI never owns infrastructure directly: every event remains scoped to the
-- authenticated Oxsig user and, when applicable, one owned Cyber Lab instance.

CREATE TABLE IF NOT EXISTS ai_practitioner_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    owner_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    lab_instance_id UUID REFERENCES lab_instances(id) ON DELETE SET NULL,
    event_type VARCHAR(32) NOT NULL CHECK (event_type IN ('plan', 'execution', 'analysis')),
    prompt TEXT,
    command TEXT,
    stdout TEXT,
    stderr TEXT,
    exit_code INTEGER,
    model VARCHAR(128),
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ai_practitioner_owner_created
    ON ai_practitioner_events(owner_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_ai_practitioner_lab_created
    ON ai_practitioner_events(lab_instance_id, created_at DESC)
    WHERE lab_instance_id IS NOT NULL;

COMMENT ON TABLE ai_practitioner_events IS 'Auditable AI Practitioner plans, approved lab executions, and evidence explanations';
