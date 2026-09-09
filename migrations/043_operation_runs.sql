-- Durable multi-node Operation runs.
-- Operation targets are lifecycle-managed independently from the user's single interactive Cyber Lab.

CREATE TABLE IF NOT EXISTS operation_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  operation_slug VARCHAR(120) NOT NULL,
  mode VARCHAR(32) NOT NULL CHECK (mode IN ('practice','walkthrough','challenge','warroom')),
  status VARCHAR(32) NOT NULL DEFAULT 'provisioning' CHECK (status IN ('provisioning','running','destroying','destroyed','failed')),
  operator_lab_instance_id UUID REFERENCES lab_instances(id) ON DELETE SET NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  last_error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS operation_nodes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id UUID NOT NULL REFERENCES operation_runs(id) ON DELETE CASCADE,
  node_key VARCHAR(80) NOT NULL,
  label VARCHAR(160) NOT NULL,
  role VARCHAR(32) NOT NULL CHECK (role IN ('operator','target','infrastructure')),
  os_family VARCHAR(32) NOT NULL,
  status VARCHAR(32) NOT NULL DEFAULT 'provisioning' CHECK (status IN ('provisioning','running','destroying','destroyed','failed')),
  runtime_provider VARCHAR(64) NOT NULL DEFAULT 'aws-ec2',
  runtime_external_id VARCHAR(255),
  private_ip INET,
  lab_instance_id UUID REFERENCES lab_instances(id) ON DELETE SET NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  last_error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(run_id, node_key)
);

CREATE INDEX IF NOT EXISTS idx_operation_runs_owner_created ON operation_runs(owner_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_operation_runs_status_expiry ON operation_runs(status, expires_at);
CREATE INDEX IF NOT EXISTS idx_operation_nodes_run ON operation_nodes(run_id, node_key);
CREATE INDEX IF NOT EXISTS idx_operation_nodes_runtime_external ON operation_nodes(runtime_external_id) WHERE runtime_external_id IS NOT NULL;

COMMENT ON TABLE operation_runs IS 'Durable lifecycle state for preconfigured OXSIG Operations. Runtime status is not readiness proof.';
COMMENT ON TABLE operation_nodes IS 'Compute nodes belonging to an Operation. Only operator nodes are exposed as ordinary interactive Cyber Lab instances.';
