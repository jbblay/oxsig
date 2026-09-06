-- Prediction-before-execution and learner-explanation evidence for Academy.
--
-- Existing academy_mastery.score keeps its historical completion/practice meaning.
-- Understanding is tracked separately so Oxsig can distinguish task completion
-- from the learner's demonstrated explanation of real execution evidence.

CREATE TABLE IF NOT EXISTS academy_learning_reflections (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    course_id UUID NOT NULL REFERENCES academy_courses(id) ON DELETE CASCADE,
    owner_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    lesson_id VARCHAR(64) NOT NULL,
    command TEXT NOT NULL,
    prediction TEXT NOT NULL,
    evidence_id UUID REFERENCES execution_evidence(id) ON DELETE SET NULL,
    explanation TEXT,
    evaluation JSONB,
    explanation_score INTEGER CHECK (explanation_score IS NULL OR explanation_score BETWEEN 0 AND 100),
    model VARCHAR(128),
    status VARCHAR(16) NOT NULL DEFAULT 'predicted'
        CHECK (status IN ('predicted', 'reflected')),
    evidence_bound_at TIMESTAMPTZ,
    reflected_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CHECK (length(btrim(prediction)) BETWEEN 1 AND 2000),
    CHECK (length(command) BETWEEN 1 AND 1000),
    CHECK (
        (status = 'predicted' AND evidence_id IS NULL AND explanation IS NULL AND evaluation IS NULL AND explanation_score IS NULL AND reflected_at IS NULL)
        OR
        (status = 'reflected' AND evidence_id IS NOT NULL AND explanation IS NOT NULL AND evaluation IS NOT NULL AND explanation_score IS NOT NULL AND evidence_bound_at IS NOT NULL AND reflected_at IS NOT NULL)
    )
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_academy_learning_reflections_one_pending
    ON academy_learning_reflections(course_id, owner_id, lesson_id)
    WHERE status = 'predicted';

CREATE UNIQUE INDEX IF NOT EXISTS idx_academy_learning_reflections_evidence
    ON academy_learning_reflections(owner_id, evidence_id)
    WHERE evidence_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_academy_learning_reflections_course
    ON academy_learning_reflections(course_id, owner_id, created_at DESC);

ALTER TABLE academy_mastery
    ADD COLUMN IF NOT EXISTS reflected_practices INTEGER NOT NULL DEFAULT 0
        CHECK (reflected_practices >= 0),
    ADD COLUMN IF NOT EXISTS understanding_score INTEGER NOT NULL DEFAULT 0
        CHECK (understanding_score BETWEEN 0 AND 100),
    ADD COLUMN IF NOT EXISTS understanding_status VARCHAR(16) NOT NULL DEFAULT 'not_started'
        CHECK (understanding_status IN ('not_started', 'developing', 'demonstrated'));

COMMENT ON TABLE academy_learning_reflections IS
    'Learner predictions captured before Academy execution and explanations scored only against the exact persisted execution evidence';
COMMENT ON COLUMN academy_mastery.understanding_score IS
    'Reflection quality multiplied by required-practice reflection coverage; separate from completion/practice mastery score';
