-- Curated, reversible Academy failure-injection lesson attempts.
-- V1 is intentionally limited to synthetic learner-owned lab workspaces under /tmp.

CREATE TABLE IF NOT EXISTS academy_failure_attempts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    course_id UUID NOT NULL REFERENCES academy_courses(id) ON DELETE CASCADE,
    owner_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    lesson_id VARCHAR(64) NOT NULL,
    lab_instance_id UUID NOT NULL REFERENCES lab_instances(id) ON DELETE CASCADE,
    template_id VARCHAR(64) NOT NULL,
    state VARCHAR(20) NOT NULL DEFAULT 'preparing'
        CHECK (state IN ('preparing', 'injected', 'remediated', 'cleaned', 'failed')),
    workspace_path TEXT NOT NULL,
    pre_evidence JSONB,
    fault_evidence JSONB,
    verification_evidence JSONB,
    cleanup_evidence JSONB,
    failure_reason TEXT,
    injected_at TIMESTAMPTZ,
    remediated_at TIMESTAMPTZ,
    cleaned_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CHECK (workspace_path ~ '^/tmp/oxsig-failure-labs/[0-9a-f-]{36}$')
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_academy_failure_attempts_one_active_lab
    ON academy_failure_attempts(owner_id, lab_instance_id)
    WHERE state IN ('preparing', 'injected', 'remediated');

CREATE INDEX IF NOT EXISTS idx_academy_failure_attempts_course_lesson
    ON academy_failure_attempts(course_id, owner_id, lesson_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_academy_failure_attempts_owner
    ON academy_failure_attempts(owner_id, created_at DESC);

COMMENT ON TABLE academy_failure_attempts IS
    'Explicitly authorized, curated, reversible Academy troubleshooting faults with server-executed pre/fault/verify/cleanup evidence';
