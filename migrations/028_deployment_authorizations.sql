-- Hash-bound Infrastructure Designer deployment authorizations.
-- Authorization records learner approval of an exact server-compiled plan. It does
-- not imply that the current runtime can execute every approved plan.

CREATE TABLE IF NOT EXISTS deployment_authorizations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    owner_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    plan_id VARCHAR(64) NOT NULL,
    plan_hash CHAR(64) NOT NULL CHECK (plan_hash ~ '^[0-9a-f]{64}$'),
    plan_snapshot JSONB NOT NULL,
    source_design_updated_at TIMESTAMPTZ NOT NULL,
    execution_support JSONB NOT NULL DEFAULT '{}'::jsonb,
    state VARCHAR(32) NOT NULL DEFAULT 'authorized'
        CHECK (state IN ('authorized','executing','evidence_recorded','analyzed','cancelled','expired','failed')),
    execution_id UUID,
    lab_instance_id UUID REFERENCES lab_instances(id) ON DELETE SET NULL,
    execution_started_at TIMESTAMPTZ,
    evidence_recorded_at TIMESTAMPTZ,
    analyzed_at TIMESTAMPTZ,
    failure_reason TEXT,
    expires_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CHECK (expires_at > created_at),
    CHECK ((state <> 'executing') OR execution_id IS NOT NULL),
    CHECK ((state NOT IN ('evidence_recorded','analyzed')) OR execution_id IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS idx_deployment_authorizations_owner_created
    ON deployment_authorizations(owner_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_deployment_authorizations_owner_plan_hash
    ON deployment_authorizations(owner_id, plan_hash, created_at DESC);

CREATE UNIQUE INDEX IF NOT EXISTS idx_deployment_authorizations_one_active_owner
    ON deployment_authorizations(owner_id)
    WHERE state IN ('authorized','executing');

COMMENT ON TABLE deployment_authorizations IS
    'Server-authoritative, expiring learner approval bound to one deterministic infrastructure deployment plan hash';
