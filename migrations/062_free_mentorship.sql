-- Migration: Free mentorship and Rescue Rooms (mentorship programme, Phase 2)
-- Description: Mentor session offerings, weekly availability, bookable
-- mentorship sessions with an append-only event trail, and an optional hard
-- expiry on Live Workspaces so a Rescue Room closes when its session ends.
-- Additive only. Paid sessions are impossible at the schema level in this
-- phase: price_cents is constrained to 0 until a reviewed commercial migration.

CREATE TABLE IF NOT EXISTS mentor_session_offerings (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  mentor_id UUID NOT NULL REFERENCES mentor_profiles(user_id) ON DELETE CASCADE,
  kind VARCHAR(24) NOT NULL CHECK (kind IN ('quick_help', 'guided_coaching', 'deep_session', 'project_review')),
  title VARCHAR(80) NOT NULL CHECK (char_length(btrim(title)) >= 3),
  description VARCHAR(500) NOT NULL DEFAULT '',
  duration_minutes SMALLINT NOT NULL CHECK (duration_minutes IN (15, 30, 45, 60)),
  price_cents INTEGER NOT NULL DEFAULT 0 CHECK (price_cents = 0),
  specialization_ids TEXT[] NOT NULL CHECK (cardinality(specialization_ids) BETWEEN 1 AND 8),
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_mentor_session_offerings_mentor
  ON mentor_session_offerings(mentor_id) WHERE is_active = true;

-- Weekly recurring availability, interpreted in the mentor profile time zone.
CREATE TABLE IF NOT EXISTS mentor_availability_rules (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  mentor_id UUID NOT NULL REFERENCES mentor_profiles(user_id) ON DELETE CASCADE,
  weekday SMALLINT NOT NULL CHECK (weekday BETWEEN 0 AND 6),
  start_minute SMALLINT NOT NULL CHECK (start_minute BETWEEN 0 AND 1425 AND start_minute % 15 = 0),
  end_minute SMALLINT NOT NULL CHECK (end_minute BETWEEN 15 AND 1440 AND end_minute % 15 = 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT mentor_availability_rules_window CHECK (end_minute > start_minute)
);

CREATE INDEX IF NOT EXISTS idx_mentor_availability_rules_mentor
  ON mentor_availability_rules(mentor_id, weekday);

CREATE TABLE IF NOT EXISTS mentorship_sessions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  -- Learner-authored content is deleted with the learner; the learner keeps
  -- their history if the mentor account is deleted.
  learner_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  mentor_id UUID REFERENCES users(id) ON DELETE SET NULL,
  -- Snapshot references, deliberately without foreign keys: the session copies
  -- everything it needs (kind, duration, topic), and the application treats a
  -- missing offering, original booking or room as "no longer available". FKs
  -- here would put two referential actions on the same row during account
  -- deletion (user -> profile -> offering, plus mentor_id), which PostgreSQL
  -- rejects, so deleting a mentor or learner account would fail.
  offering_id UUID,
  rescheduled_from UUID,
  collaboration_id UUID,
  kind VARCHAR(24) NOT NULL CHECK (kind IN ('quick_help', 'guided_coaching', 'deep_session', 'project_review')),
  duration_minutes SMALLINT NOT NULL CHECK (duration_minutes IN (15, 30, 45, 60)),
  price_cents INTEGER NOT NULL DEFAULT 0 CHECK (price_cents = 0),
  specialization_id VARCHAR(48) NOT NULL,
  status VARCHAR(16) NOT NULL DEFAULT 'requested'
    CHECK (status IN ('requested', 'confirmed', 'declined', 'cancelled', 'expired', 'completed', 'no_show')),
  starts_at TIMESTAMPTZ NOT NULL,
  ends_at TIMESTAMPTZ NOT NULL,
  learner_timezone VARCHAR(64) NOT NULL,
  topic VARCHAR(160) NOT NULL CHECK (char_length(btrim(topic)) >= 3),
  learner_goal TEXT NOT NULL CHECK (char_length(learner_goal) BETWEEN 10 AND 2000),
  attempted_summary TEXT NOT NULL DEFAULT '' CHECK (char_length(attempted_summary) <= 2000),
  shared_context JSONB NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(shared_context) = 'object'),
  mentor_note VARCHAR(1000),
  cancelled_by UUID REFERENCES users(id) ON DELETE SET NULL,
  cancellation_reason VARCHAR(500),
  late_cancellation BOOLEAN NOT NULL DEFAULT false,
  mentor_summary TEXT CHECK (mentor_summary IS NULL OR char_length(mentor_summary) <= 4000),
  confirmed_at TIMESTAMPTZ,
  closed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT mentorship_sessions_window CHECK (ends_at - starts_at = make_interval(mins => duration_minutes::int)),
  CONSTRAINT mentorship_sessions_not_self CHECK (mentor_id IS NULL OR mentor_id <> learner_id),
  CONSTRAINT mentorship_sessions_confirmation_recorded CHECK (status <> 'confirmed' OR confirmed_at IS NOT NULL)
);

-- Backstops for the application-level overlap check (which runs under
-- per-user advisory locks): no two live bookings may start at the same instant
-- for the same mentor or the same learner.
CREATE UNIQUE INDEX IF NOT EXISTS idx_mentorship_sessions_mentor_slot
  ON mentorship_sessions(mentor_id, starts_at) WHERE status IN ('requested', 'confirmed');
CREATE UNIQUE INDEX IF NOT EXISTS idx_mentorship_sessions_learner_slot
  ON mentorship_sessions(learner_id, starts_at) WHERE status IN ('requested', 'confirmed');
CREATE INDEX IF NOT EXISTS idx_mentorship_sessions_mentor_time
  ON mentorship_sessions(mentor_id, starts_at DESC);
CREATE INDEX IF NOT EXISTS idx_mentorship_sessions_learner_time
  ON mentorship_sessions(learner_id, starts_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS idx_mentorship_sessions_collaboration
  ON mentorship_sessions(collaboration_id) WHERE collaboration_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS mentorship_session_events (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  session_id UUID NOT NULL REFERENCES mentorship_sessions(id) ON DELETE CASCADE,
  actor_id UUID REFERENCES users(id) ON DELETE SET NULL,
  event_type VARCHAR(40) NOT NULL,
  from_status VARCHAR(16),
  to_status VARCHAR(16),
  detail VARCHAR(500),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_mentorship_session_events_session
  ON mentorship_session_events(session_id, created_at);

-- Rescue Rooms are ordinary Live Workspaces with a hard end. NULL keeps every
-- existing workspace open-ended exactly as before.
ALTER TABLE live_workspaces ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ;
CREATE INDEX IF NOT EXISTS idx_live_workspaces_expires_at
  ON live_workspaces(expires_at) WHERE expires_at IS NOT NULL;

COMMENT ON TABLE mentorship_sessions IS
  'Free mentorship bookings. price_cents is pinned to 0; paid sessions require a reviewed commercial migration.';
COMMENT ON COLUMN mentorship_sessions.shared_context IS
  'Mission context the learner explicitly chose to share, derived server-side. Never terminal output or credentials.';
COMMENT ON COLUMN live_workspaces.expires_at IS
  'Hard end for time-limited rooms (Rescue Rooms). Access, control leases and the terminal bridge refuse after this instant.';
