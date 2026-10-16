-- Additive: learning records remain independent of temporary lab instances.
ALTER TABLE academy_mission_progress
  ADD COLUMN IF NOT EXISTS concept_answer text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS concept_feedback jsonb,
  ADD COLUMN IF NOT EXISTS concept_reviewed_at timestamptz;
