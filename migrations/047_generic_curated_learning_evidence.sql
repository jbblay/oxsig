-- Generalize curated Academy evidence so every versioned path registered with the
-- `OXSIG curated path:<path-id>@<version>` source contract can use the durable
-- learning_path_enrollments / learning_capability_evidence model introduced in 039.

CREATE OR REPLACE FUNCTION sync_curated_practice_evidence()
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
       AND c.source_prompt = 'OXSIG curated path:' || e.path_id || '@' || e.path_version::text
     WHERE e.owner_id = NEW.owner_id
       AND e.status = 'active'
     ORDER BY e.updated_at DESC
     LIMIT 1;

    IF enrollment IS NULL THEN RETURN NEW; END IF;

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
        enrollment_id = EXCLUDED.enrollment_id,
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

CREATE OR REPLACE FUNCTION sync_curated_reflection_evidence()
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
       AND c.source_prompt = 'OXSIG curated path:' || e.path_id || '@' || e.path_version::text
     WHERE e.owner_id = NEW.owner_id
       AND e.status = 'active'
     ORDER BY e.updated_at DESC
     LIMIT 1;

    IF enrollment IS NULL THEN RETURN NEW; END IF;

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
        enrollment_id = EXCLUDED.enrollment_id,
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

DROP TRIGGER IF EXISTS trg_program_process_practice_evidence ON academy_practice_attempts;
DROP TRIGGER IF EXISTS trg_curated_practice_evidence ON academy_practice_attempts;
CREATE TRIGGER trg_curated_practice_evidence
AFTER INSERT OR UPDATE OF evaluation ON academy_practice_attempts
FOR EACH ROW EXECUTE FUNCTION sync_curated_practice_evidence();

DROP TRIGGER IF EXISTS trg_program_process_reflection_evidence ON academy_learning_reflections;
DROP TRIGGER IF EXISTS trg_curated_reflection_evidence ON academy_learning_reflections;
CREATE TRIGGER trg_curated_reflection_evidence
AFTER INSERT OR UPDATE OF status, explanation_score ON academy_learning_reflections
FOR EACH ROW EXECUTE FUNCTION sync_curated_reflection_evidence();

DROP FUNCTION IF EXISTS sync_program_process_practice_evidence();
DROP FUNCTION IF EXISTS sync_program_process_reflection_evidence();

COMMENT ON FUNCTION sync_curated_practice_evidence() IS
    'Records server-evaluated Academy practice evidence for the active versioned curated learning path associated with the course.';
COMMENT ON FUNCTION sync_curated_reflection_evidence() IS
    'Records reflected Academy understanding evidence for the active versioned curated learning path associated with the course.';
