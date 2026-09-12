-- Stable AI request IDs make plan persistence idempotent across retries and races.
-- Historical plan rows do not contain requestId and remain unaffected.

CREATE UNIQUE INDEX IF NOT EXISTS idx_ai_practitioner_owner_plan_request
    ON ai_practitioner_events (owner_id, (metadata->>'requestId'))
    WHERE event_type = 'plan'
      AND metadata ? 'requestId'
      AND length(metadata->>'requestId') > 0;

COMMENT ON INDEX idx_ai_practitioner_owner_plan_request IS
    'Prevents duplicate persisted AI plan turns when the same logical request is retried';
