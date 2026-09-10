-- Bind AI Practitioner plans and visible-terminal evidence to exact Operation runs and nodes.
-- Operation targets are not ordinary Cyber Lab instances, so the existing evidence ledger
-- keeps its provenance/state model while gaining explicit Operation ownership coordinates.

ALTER TABLE execution_evidence
    ADD COLUMN IF NOT EXISTS operation_run_id UUID REFERENCES operation_runs(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS operation_node_id UUID REFERENCES operation_nodes(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_execution_evidence_operation_node_created
    ON execution_evidence(operation_run_id, operation_node_id, created_at DESC)
    WHERE operation_node_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_execution_evidence_operation_terminal_lookup
    ON execution_evidence(owner_id, operation_run_id, operation_node_id, command_hash, created_at DESC)
    WHERE source='interactive-terminal' AND operation_node_id IS NOT NULL;

ALTER TABLE ai_practitioner_events
    ADD COLUMN IF NOT EXISTS operation_run_id UUID REFERENCES operation_runs(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS operation_node_id UUID REFERENCES operation_nodes(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_ai_practitioner_operation_created
    ON ai_practitioner_events(owner_id, operation_run_id, operation_node_id, created_at DESC)
    WHERE operation_run_id IS NOT NULL;

COMMENT ON COLUMN execution_evidence.operation_run_id IS
    'Operation run that owned this execution when the evidence came from an Operation terminal';
COMMENT ON COLUMN execution_evidence.operation_node_id IS
    'Exact Operation machine that produced this execution evidence';
COMMENT ON COLUMN ai_practitioner_events.operation_node_id IS
    'Exact Operation machine the Practitioner was teaching or executing against';
