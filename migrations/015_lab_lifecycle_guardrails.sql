-- Lab lifecycle guardrails.
-- Enforce the MVP invariant that one user can have at most one nonterminal
-- cloud lab allocation at a time. Application checks remain useful for UX,
-- but this database constraint is the concurrency-safe authority.

DO $$
BEGIN
  IF EXISTS (
    SELECT owner_id
    FROM lab_instances
    WHERE status NOT IN ('destroyed', 'failed')
    GROUP BY owner_id
    HAVING COUNT(*) > 1
  ) THEN
    RAISE EXCEPTION
      'Cannot enable one-lab-per-user guardrail: duplicate nonterminal lab allocations exist';
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS idx_lab_instances_one_nonterminal_per_owner
ON lab_instances(owner_id)
WHERE status NOT IN ('destroyed', 'failed');

COMMENT ON INDEX idx_lab_instances_one_nonterminal_per_owner IS
  'Concurrency-safe MVP guardrail: at most one nonterminal lab allocation per Oxsig user.';
