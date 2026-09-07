-- Durable learner-facing activity rollups for streaks and dashboard analytics.
-- This table stores counts by learner/day only; it does not store command text,
-- terminal contents, or other sensitive lab payloads.

CREATE TABLE IF NOT EXISTS learning_activity_days (
    owner_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    activity_date DATE NOT NULL,
    academy_actions INTEGER NOT NULL DEFAULT 0 CHECK (academy_actions >= 0),
    lab_actions INTEGER NOT NULL DEFAULT 0 CHECK (lab_actions >= 0),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (owner_id, activity_date)
);

CREATE INDEX IF NOT EXISTS idx_learning_activity_days_owner_date
    ON learning_activity_days(owner_id, activity_date DESC);

-- Backfill only dates that can be proven from existing durable records. An older
-- Academy session may have been active on additional days that were never stored,
-- so this migration intentionally does not fabricate those missing days.
WITH historical_activity AS (
    SELECT owner_id,
           (started_at AT TIME ZONE 'UTC')::date AS activity_date,
           1::int AS academy_actions,
           0::int AS lab_actions
    FROM academy_sessions

    UNION ALL

    SELECT owner_id,
           (last_activity_at AT TIME ZONE 'UTC')::date AS activity_date,
           1::int AS academy_actions,
           0::int AS lab_actions
    FROM academy_sessions

    UNION ALL

    SELECT owner_id,
           (created_at AT TIME ZONE 'UTC')::date AS activity_date,
           1::int AS academy_actions,
           0::int AS lab_actions
    FROM academy_practice_attempts

    UNION ALL

    SELECT owner_id,
           (started_at AT TIME ZONE 'UTC')::date AS activity_date,
           0::int AS academy_actions,
           1::int AS lab_actions
    FROM lab_instances
    WHERE started_at IS NOT NULL
), rolled AS (
    SELECT owner_id,
           activity_date,
           SUM(academy_actions)::int AS academy_actions,
           SUM(lab_actions)::int AS lab_actions
    FROM historical_activity
    GROUP BY owner_id, activity_date
)
INSERT INTO learning_activity_days (owner_id, activity_date, academy_actions, lab_actions)
SELECT owner_id, activity_date, academy_actions, lab_actions
FROM rolled
ON CONFLICT (owner_id, activity_date) DO UPDATE
SET academy_actions = GREATEST(learning_activity_days.academy_actions, EXCLUDED.academy_actions),
    lab_actions = GREATEST(learning_activity_days.lab_actions, EXCLUDED.lab_actions),
    updated_at = NOW();

COMMENT ON TABLE learning_activity_days IS 'Per-user daily learner activity counters used for truthful streaks, heatmaps, and reward progress.';
