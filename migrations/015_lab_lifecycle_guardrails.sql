-- Lab lifecycle guardrails.
-- Enforce the MVP invariant that one user can have at most one live/usable
-- cloud lab allocation at a time. A lab whose AWS termination request has
-- already been accepted is in 'destroying' state and no longer blocks a new
-- allocation. Application checks remain useful for UX, but this database
-- constraint is the concurrency-safe authority.

DO $$
BEGIN
  IF EXISTS (
    SELECT owner_id
    FROM lab_instances
    WHERE status NOT IN ('destroying', 'destroyed', 'failed')
    GROUP BY owner_id
    HAVING COUNT(*) > 1
  ) THEN
    RAISE EXCEPTION
      'Cannot enable one-lab-per-user guardrail: duplicate live lab allocations exist';
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS idx_lab_instances_one_nonterminal_per_owner
ON lab_instances(owner_id)
WHERE status NOT IN ('destroying', 'destroyed', 'failed');

COMMENT ON INDEX idx_lab_instances_one_nonterminal_per_owner IS
  'Concurrency-safe MVP guardrail: at most one live/usable lab allocation per Oxsig user.';
