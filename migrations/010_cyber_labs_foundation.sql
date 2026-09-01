-- OXSIG Cyber Labs foundation
-- This migration stores ownership and lifecycle metadata only.
-- It does not provision containers or VMs and must never be treated as proof that a runtime is active.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS lab_definitions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug VARCHAR(120) NOT NULL UNIQUE,
  name VARCHAR(255) NOT NULL,
  category VARCHAR(120) NOT NULL,
  description TEXT,
  difficulty VARCHAR(32) NOT NULL CHECK (difficulty IN ('beginner', 'intermediate', 'advanced', 'expert')),
  runtime_kind VARCHAR(32) NOT NULL CHECK (runtime_kind IN ('container', 'vm')),
  definition JSONB NOT NULL DEFAULT '{}'::jsonb,
  enabled BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS lab_instances (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  definition_id UUID NOT NULL REFERENCES lab_definitions(id) ON DELETE RESTRICT,
  owner_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status VARCHAR(32) NOT NULL DEFAULT 'created' CHECK (
    status IN (
      'created',
      'provisioning',
      'running',
      'stopping',
      'stopped',
      'resetting',
      'destroying',
      'destroyed',
      'failed'
    )
  ),
  runtime_provider VARCHAR(64),
  runtime_external_id VARCHAR(255),
  started_at TIMESTAMPTZ,
  stopped_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ,
  last_error TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_lab_instances_owner ON lab_instances(owner_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_lab_instances_status ON lab_instances(status);
CREATE INDEX IF NOT EXISTS idx_lab_instances_definition ON lab_instances(definition_id);

CREATE TABLE IF NOT EXISTS lab_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lab_instance_id UUID NOT NULL REFERENCES lab_instances(id) ON DELETE CASCADE,
  event_type VARCHAR(120) NOT NULL,
  source VARCHAR(64) NOT NULL DEFAULT 'platform',
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_lab_events_instance_time ON lab_events(lab_instance_id, created_at DESC);

COMMENT ON TABLE lab_instances IS 'Platform lifecycle metadata for isolated cyber lab instances. A running status must only be set after the runtime adapter confirms real compute is active.';
COMMENT ON TABLE lab_events IS 'Events associated with an assigned lab. Lab events are separate from OXSIG platform audit events.';
