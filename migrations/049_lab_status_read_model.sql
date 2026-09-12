-- Fast Cyber Lab status read model.
-- Provider observations are stored separately from lifecycle command state so ordinary reads
-- can return durable state without waiting for EC2/SSM control-plane calls.

ALTER TABLE lab_instances
  ADD COLUMN IF NOT EXISTS runtime_observed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS reconciliation_warning TEXT;

COMMENT ON COLUMN lab_instances.runtime_observed_at IS
  'Last time the platform successfully observed this lab runtime from the provider. NULL means the persisted lifecycle state has not yet been provider-confirmed by the read model.';

COMMENT ON COLUMN lab_instances.reconciliation_warning IS
  'Learner-safe warning from the latest provider reconciliation attempt. Provider failures preserve the previous lifecycle state instead of replacing it with an empty/default state.';
