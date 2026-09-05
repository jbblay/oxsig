-- Durable Academy learning sessions and mastery summaries.
-- These records make progress measurable independently of browser state and
-- give OXSIG a stable server-side contract for history, completion and future
-- adaptive-learning decisions.

CREATE TABLE IF NOT EXISTS academy_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    course_id UUID NOT NULL REFERENCES academy_courses(id) ON DELETE CASCADE,
    owner_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    status VARCHAR(16) NOT NULL DEFAULT 'active'
        CHECK (status IN ('active', 'completed', 'abandoned')),
    started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_activity_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    completed_at TIMESTAMPTZ
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_academy_sessions_one_active_per_owner
    ON academy_sessions(owner_id)
    WHERE status = 'active';

CREATE INDEX IF NOT EXISTS idx_academy_sessions_course
    ON academy_sessions(course_id, started_at DESC);

CREATE TABLE IF NOT EXISTS academy_mastery (
    course_id UUID PRIMARY KEY REFERENCES academy_courses(id) ON DELETE CASCADE,
    owner_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    completed_lessons INTEGER NOT NULL DEFAULT 0 CHECK (completed_lessons >= 0),
    total_lessons INTEGER NOT NULL DEFAULT 0 CHECK (total_lessons >= 0),
    passed_practices INTEGER NOT NULL DEFAULT 0 CHECK (passed_practices >= 0),
    required_practices INTEGER NOT NULL DEFAULT 0 CHECK (required_practices >= 0),
    score INTEGER NOT NULL DEFAULT 0 CHECK (score BETWEEN 0 AND 100),
    status VARCHAR(16) NOT NULL DEFAULT 'in_progress'
        CHECK (status IN ('in_progress', 'mastered')),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_academy_mastery_owner
    ON academy_mastery(owner_id, updated_at DESC);

COMMENT ON TABLE academy_sessions IS 'Durable lifecycle for a learner working through an Academy course';
COMMENT ON TABLE academy_mastery IS 'Server-computed Academy completion and verified-practice mastery summary';