-- Guest-service readiness evidence is a separate immutable observation from
-- provider allocation and runtime-management readiness. OXSIG executes a fixed
-- read-only inspection through SSM and records the resulting guest facts.

ALTER TABLE execution_evidence
    DROP CONSTRAINT IF EXISTS execution_evidence_source_check;

ALTER TABLE execution_evidence
    ADD CONSTRAINT execution_evidence_source_check
    CHECK (source IN ('interactive-terminal','deployment','runtime-readiness','guest-service-readiness'));

CREATE INDEX IF NOT EXISTS idx_execution_evidence_guest_service_readiness
    ON execution_evidence(owner_id, lab_instance_id, evidence_recorded_at DESC)
    WHERE source='guest-service-readiness';

COMMENT ON CONSTRAINT execution_evidence_source_check ON execution_evidence IS
    'Evidence source distinguishes interactive terminal, deployment allocation, runtime-management readiness, and guest-service readiness observations';
