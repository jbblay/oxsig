-- Reusable multi-node Operation environments.
-- A temporary user run reserves permanent compute; the environment owns EC2 and baseline state.

CREATE TABLE IF NOT EXISTS operation_environments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  operation_slug VARCHAR(120) NOT NULL,
  slot_key VARCHAR(120) NOT NULL,
  status VARCHAR(32) NOT NULL DEFAULT 'available'
    CHECK (status IN ('available','reserved','starting','verifying','ready','in_use','stopping','resetting','failed','maintenance')),
  dc_instance_id VARCHAR(255) NOT NULL,
  workstation_instance_id VARCHAR(255) NOT NULL,
  operator_instance_id VARCHAR(255) NOT NULL,
  dc_private_ip INET NOT NULL,
  workstation_private_ip INET NOT NULL,
  operator_private_ip INET NOT NULL,
  dc_baseline_snapshot_id VARCHAR(255),
  workstation_baseline_snapshot_id VARCHAR(255),
  operator_baseline_snapshot_id VARCHAR(255),
  assigned_run_id UUID REFERENCES operation_runs(id) ON DELETE SET NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  last_error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(operation_slug, slot_key)
);

ALTER TABLE operation_runs
  ADD COLUMN IF NOT EXISTS environment_id UUID REFERENCES operation_environments(id) ON DELETE SET NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_operation_environments_assigned_run
  ON operation_environments(assigned_run_id)
  WHERE assigned_run_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_operation_environments_available
  ON operation_environments(operation_slug, status, updated_at)
  WHERE status = 'available';

COMMENT ON TABLE operation_environments IS
  'Permanent reusable Operation compute slots. Runs reserve slots; slots survive run destruction.';
COMMENT ON COLUMN operation_environments.status IS
  'Only available slots may be allocated. Maintenance prevents reuse until external reset succeeds.';
