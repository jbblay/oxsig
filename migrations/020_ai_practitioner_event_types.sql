-- Keep the AI Practitioner audit contract aligned with visible-terminal execution.
-- PR #45 introduced a distinct approval event before the real terminal run, but
-- migration 019 only allowed plan/execution/analysis. Existing databases need a
-- forward migration rather than editing already-applied history.

DO $$
DECLARE
    constraint_record RECORD;
BEGIN
    FOR constraint_record IN
        SELECT conname
        FROM pg_constraint
        WHERE conrelid = 'ai_practitioner_events'::regclass
          AND contype = 'c'
          AND pg_get_constraintdef(oid) ILIKE '%event_type%'
    LOOP
        EXECUTE format(
            'ALTER TABLE ai_practitioner_events DROP CONSTRAINT %I',
            constraint_record.conname
        );
    END LOOP;
END $$;

ALTER TABLE ai_practitioner_events
    ADD CONSTRAINT ai_practitioner_events_event_type_check
    CHECK (event_type IN ('plan', 'execution-approved', 'execution', 'analysis'));

COMMENT ON TABLE ai_practitioner_events IS
    'Auditable AI Practitioner plans, explicit execution approvals, real lab executions, and evidence explanations';
