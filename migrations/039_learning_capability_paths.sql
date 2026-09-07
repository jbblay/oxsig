-- Durable capability-path enrollment and evidence.
-- Path structure remains curated/versioned in application code; these tables store only
-- authenticated learner state and evidence, so UI progress never needs invented defaults.

CREATE TABLE IF NOT EXISTS learning_path_enrollments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    owner_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    path_id VARCHAR(96) NOT NULL,
    path_version INTEGER NOT NULL CHECK (path_version > 0),
    status VARCHAR(16) NOT NULL DEFAULT 'active'
        CHECK (status IN ('active', 'completed', 'abandoned')),
    active_capability_id VARCHAR(96),
    enrolled_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_activity_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    completed_at TIMESTAMPTZ,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (owner_id, path_id, path_version)
);

CREATE INDEX IF NOT EXISTS idx_learning_path_enrollments_owner
    ON learning_path_enrollments(owner_id, status, updated_at DESC);

CREATE TABLE IF NOT EXISTS learning_capability_evidence (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    enrollment_id UUID NOT NULL REFERENCES learning_path_enrollments(id) ON DELETE CASCADE,
    owner_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    capability_id VARCHAR(96) NOT NULL,
    source_type VARCHAR(32) NOT NULL
        CHECK (source_type IN ('academy-practice', 'academy-reflection', 'assessment')),
    source_id UUID NOT NULL,
    result VARCHAR(20) NOT NULL
        CHECK (result IN ('attempted', 'demonstrated')),
    score INTEGER CHECK (score IS NULL OR score BETWEEN 0 AND 100),
    evidence JSONB NOT NULL DEFAULT '{}'::jsonb,
    demonstrated_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (owner_id, capability_id, source_type, source_id),
    CHECK (
        (result = 'demonstrated' AND demonstrated_at IS NOT NULL)
        OR (result = 'attempted' AND demonstrated_at IS NULL)
    )
);

CREATE INDEX IF NOT EXISTS idx_learning_capability_evidence_enrollment
    ON learning_capability_evidence(enrollment_id, capability_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_learning_capability_evidence_owner
    ON learning_capability_evidence(owner_id, result, created_at DESC);

COMMENT ON TABLE learning_path_enrollments IS
    'User enrollment in a stable curated OXSIG capability path; path definitions are versioned in application code.';
COMMENT ON TABLE learning_capability_evidence IS
    'Deduplicated evidence that a learner attempted or demonstrated a capability. Page views and manual lesson completion are not evidence.';
