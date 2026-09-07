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

-- V1 bridges the existing evidence-grounded Academy into the capability model without
-- allowing browser page state or the legacy "Mark complete" control to manufacture evidence.
CREATE OR REPLACE FUNCTION sync_program_process_practice_evidence()
RETURNS TRIGGER AS $$
DECLARE
    enrollment UUID;
BEGIN
    IF COALESCE(NEW.evaluation->>'status', '') <> 'passed' THEN
        RETURN NEW;
    END IF;

    SELECT e.id INTO enrollment
      FROM learning_path_enrollments e
      JOIN academy_courses c
        ON c.id = NEW.course_id
       AND c.owner_id = NEW.owner_id
     WHERE e.owner_id = NEW.owner_id
       AND e.path_id = 'program-becomes-process'
       AND e.path_version = 1
       AND e.status = 'active'
       AND c.source_prompt = 'OXSIG curated path:program-becomes-process@1'
     LIMIT 1;

    IF enrollment IS NULL THEN
        RETURN NEW;
    END IF;

    INSERT INTO learning_capability_evidence (
        enrollment_id, owner_id, capability_id, source_type, source_id,
        result, score, evidence, demonstrated_at, updated_at
    ) VALUES (
        enrollment, NEW.owner_id, NEW.lesson_id, 'academy-practice', NEW.id,
        'demonstrated', NULL,
        jsonb_build_object('courseId', NEW.course_id, 'labInstanceId', NEW.lab_instance_id),
        NOW(), NOW()
    )
    ON CONFLICT (owner_id, capability_id, source_type, source_id)
    DO UPDATE SET
        result = 'demonstrated',
        evidence = EXCLUDED.evidence,
        demonstrated_at = COALESCE(learning_capability_evidence.demonstrated_at, NOW()),
        updated_at = NOW();

    UPDATE learning_path_enrollments
       SET active_capability_id = NEW.lesson_id,
           last_activity_at = NOW(),
           updated_at = NOW()
     WHERE id = enrollment;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_program_process_practice_evidence ON academy_practice_attempts;
CREATE TRIGGER trg_program_process_practice_evidence
AFTER INSERT OR UPDATE OF evaluation ON academy_practice_attempts
FOR EACH ROW EXECUTE FUNCTION sync_program_process_practice_evidence();

CREATE OR REPLACE FUNCTION sync_program_process_reflection_evidence()
RETURNS TRIGGER AS $$
DECLARE
    enrollment UUID;
    evidence_result VARCHAR(20);
BEGIN
    IF NEW.status <> 'reflected' OR NEW.explanation_score IS NULL THEN
        RETURN NEW;
    END IF;

    SELECT e.id INTO enrollment
      FROM learning_path_enrollments e
      JOIN academy_courses c
        ON c.id = NEW.course_id
       AND c.owner_id = NEW.owner_id
     WHERE e.owner_id = NEW.owner_id
       AND e.path_id = 'program-becomes-process'
       AND e.path_version = 1
       AND e.status = 'active'
       AND c.source_prompt = 'OXSIG curated path:program-becomes-process@1'
     LIMIT 1;

    IF enrollment IS NULL THEN
        RETURN NEW;
    END IF;

    evidence_result := CASE WHEN NEW.explanation_score >= 70 THEN 'demonstrated' ELSE 'attempted' END;

    INSERT INTO learning_capability_evidence (
        enrollment_id, owner_id, capability_id, source_type, source_id,
        result, score, evidence, demonstrated_at, updated_at
    ) VALUES (
        enrollment, NEW.owner_id, NEW.lesson_id, 'academy-reflection', NEW.id,
        evidence_result, NEW.explanation_score,
        jsonb_build_object('courseId', NEW.course_id, 'executionEvidenceId', NEW.evidence_id),
        CASE WHEN evidence_result = 'demonstrated' THEN NOW() ELSE NULL END,
        NOW()
    )
    ON CONFLICT (owner_id, capability_id, source_type, source_id)
    DO UPDATE SET
        result = EXCLUDED.result,
        score = EXCLUDED.score,
        evidence = EXCLUDED.evidence,
        demonstrated_at = CASE
            WHEN EXCLUDED.result = 'demonstrated'
            THEN COALESCE(learning_capability_evidence.demonstrated_at, NOW())
            ELSE NULL
        END,
        updated_at = NOW();

    UPDATE learning_path_enrollments
       SET active_capability_id = NEW.lesson_id,
           last_activity_at = NOW(),
           updated_at = NOW()
     WHERE id = enrollment;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_program_process_reflection_evidence ON academy_learning_reflections;
CREATE TRIGGER trg_program_process_reflection_evidence
AFTER INSERT OR UPDATE OF status, explanation_score ON academy_learning_reflections
FOR EACH ROW EXECUTE FUNCTION sync_program_process_reflection_evidence();

COMMENT ON TABLE learning_path_enrollments IS
    'User enrollment in a stable curated OXSIG capability path; path definitions are versioned in application code.';
COMMENT ON TABLE learning_capability_evidence IS
    'Deduplicated evidence that a learner attempted or demonstrated a capability. Page views and manual lesson completion are not evidence.';
