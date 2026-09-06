-- End-to-end desktop access-path evidence combines a server-issued controlled
-- SSM session claim with a browser-observed successful RFB/VNC handshake.
-- The aggregate provenance remains browser-observed because the final display
-- negotiation is observed in the learner's browser, not provider-attested.

ALTER TABLE execution_evidence
    DROP CONSTRAINT IF EXISTS execution_evidence_source_check;

ALTER TABLE execution_evidence
    ADD CONSTRAINT execution_evidence_source_check
    CHECK (source IN (
        'interactive-terminal',
        'deployment',
        'runtime-readiness',
        'guest-service-readiness',
        'access-path-readiness'
    ));

CREATE INDEX IF NOT EXISTS idx_execution_evidence_access_path_readiness
    ON execution_evidence(owner_id, lab_instance_id, evidence_recorded_at DESC)
    WHERE source='access-path-readiness';

COMMENT ON CONSTRAINT execution_evidence_source_check ON execution_evidence IS
    'Evidence source distinguishes terminal, deployment, runtime-management, guest-service, and browser-observed end-to-end access-path observations';
