-- Adaptive Academy instructor interventions and learner independence tracking.
--
-- Existing academy_mastery.score and understanding_score keep their prior meanings.
-- Independence is stored separately so Oxsig can distinguish demonstrated understanding
-- from how much instructor support was required to reach it.

CREATE TABLE IF NOT EXISTS academy_instructor_interventions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    course_id UUID NOT NULL REFERENCES academy_courses(id) ON DELETE CASCADE,
    owner_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    lesson_id VARCHAR(64) NOT NULL,
    recommended_mode VARCHAR(16) NOT NULL
        CHECK (recommended_mode IN ('explain', 'guide', 'demonstrate', 'observe')),
    requested_mode VARCHAR(16) NOT NULL
        CHECK (requested_mode IN ('explain', 'guide', 'demonstrate', 'observe')),
    applied_mode VARCHAR(16) NOT NULL
        CHECK (applied_mode IN ('explain', 'guide', 'demonstrate', 'observe')),
    intervention_kind VARCHAR(24) NOT NULL
        CHECK (intervention_kind IN ('hint', 'explanation', 'demonstration', 'observation')),
    hint_level SMALLINT NOT NULL DEFAULT 0
        CHECK (hint_level BETWEEN 0 AND 3),
    assistance_weight SMALLINT NOT NULL
        CHECK (assistance_weight BETWEEN 0 AND 60),
    understanding_score_snapshot INTEGER NOT NULL DEFAULT 0
        CHECK (understanding_score_snapshot BETWEEN 0 AND 100),
    reflection_score_snapshot INTEGER
        CHECK (reflection_score_snapshot IS NULL OR reflection_score_snapshot BETWEEN 0 AND 100),
    practice_status_snapshot VARCHAR(24)
        CHECK (practice_status_snapshot IS NULL OR practice_status_snapshot IN ('passed', 'needs-attention')),
    content JSONB NOT NULL,
    model VARCHAR(128),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_academy_instructor_interventions_lesson
    ON academy_instructor_interventions(course_id, owner_id, lesson_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_academy_instructor_interventions_owner
    ON academy_instructor_interventions(owner_id, created_at DESC);

ALTER TABLE academy_mastery
    ADD COLUMN IF NOT EXISTS instructor_interventions INTEGER NOT NULL DEFAULT 0
        CHECK (instructor_interventions >= 0),
    ADD COLUMN IF NOT EXISTS independence_score INTEGER NOT NULL DEFAULT 0
        CHECK (independence_score BETWEEN 0 AND 100),
    ADD COLUMN IF NOT EXISTS independence_status VARCHAR(16) NOT NULL DEFAULT 'not_started'
        CHECK (independence_status IN ('not_started', 'supported', 'independent'));

COMMENT ON TABLE academy_instructor_interventions IS
    'Durable Academy instructor support events, including progressive hints, explanation, demonstration, and observation prompts';
COMMENT ON COLUMN academy_instructor_interventions.assistance_weight IS
    'Deterministic support cost used only for the separate learner-independence metric';
COMMENT ON COLUMN academy_mastery.independence_score IS
    'Coverage-weighted learner independence score, separate from mastery and understanding';
