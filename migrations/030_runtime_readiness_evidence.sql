-- Runtime readiness evidence extends the Execution Evidence Ledger without
-- overloading provider allocation evidence. The aggregate readiness observation
-- is server-executed and may contain fact-level provider attestations.

ALTER TABLE execution_evidence
    DROP CONSTRAINT IF EXISTS execution_evidence_source_check;

ALTER TABLE execution_evidence
    ADD CONSTRAINT execution_evidence_source_check
    CHECK (source IN ('interactive-terminal','deployment','runtime-readiness'));

CREATE INDEX IF NOT EXISTS idx_execution_evidence_runtime_readiness
    ON execution_evidence(owner_id, lab_instance_id, evidence_recorded_at DESC)
    WHERE source='runtime-readiness';

COMMENT ON CONSTRAINT execution_evidence_source_check ON execution_evidence IS
    'Evidence source distinguishes interactive terminal, deployment allocation, and runtime readiness observations';
