-- Durable AI Academy state. PostgreSQL is the production source of truth while
-- browser storage remains a cache/migration bridge for the current Academy UI.

CREATE TABLE IF NOT EXISTS academy_courses (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    owner_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    source_prompt TEXT NOT NULL DEFAULT '',
    course_data JSONB NOT NULL,
    status VARCHAR(16) NOT NULL DEFAULT 'active'
        CHECK (status IN ('active', 'archived')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_academy_courses_one_active_per_owner
    ON academy_courses(owner_id)
    WHERE status = 'active';

CREATE INDEX IF NOT EXISTS idx_academy_courses_owner_created
    ON academy_courses(owner_id, created_at DESC);

CREATE TABLE IF NOT EXISTS academy_progress (
    course_id UUID PRIMARY KEY REFERENCES academy_courses(id) ON DELETE CASCADE,
    owner_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    active_lesson_index INTEGER NOT NULL DEFAULT 0 CHECK (active_lesson_index >= 0),
    completed_lesson_ids JSONB NOT NULL DEFAULT '[]'::jsonb,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_academy_progress_owner
    ON academy_progress(owner_id, updated_at DESC);

CREATE TABLE IF NOT EXISTS academy_questions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    course_id UUID NOT NULL REFERENCES academy_courses(id) ON DELETE CASCADE,
    owner_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    lesson_id VARCHAR(64) NOT NULL,
    question TEXT NOT NULL,
    answer JSONB NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_academy_questions_course_lesson
    ON academy_questions(course_id, lesson_id, created_at ASC);

CREATE TABLE IF NOT EXISTS academy_practice_attempts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    course_id UUID NOT NULL REFERENCES academy_courses(id) ON DELETE CASCADE,
    owner_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    lesson_id VARCHAR(64) NOT NULL,
    lab_instance_id UUID REFERENCES lab_instances(id) ON DELETE SET NULL,
    command TEXT NOT NULL,
    stdout TEXT NOT NULL DEFAULT '',
    stderr TEXT NOT NULL DEFAULT '',
    exit_code INTEGER NOT NULL,
    evaluation JSONB NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_academy_practice_course_lesson
    ON academy_practice_attempts(course_id, lesson_id, created_at DESC);

COMMENT ON TABLE academy_courses IS 'User-owned AI Academy courses persisted independently of browser storage';
COMMENT ON TABLE academy_progress IS 'Durable per-course Academy navigation and completion progress';
COMMENT ON TABLE academy_questions IS 'Academy instructor question and answer history';
COMMENT ON TABLE academy_practice_attempts IS 'Real terminal evidence and AI evaluation history for Academy checkpoints';
