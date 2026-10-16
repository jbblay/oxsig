-- The production Neon branch has pgcrypto but not uuid-ossp. This migration
-- uses uuid_generate_v4() for mentor records, so install its required extension
-- explicitly before creating the tables. This is safe on an existing database.
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Migration: Mentor foundation (mentorship programme, Phase 1)
-- Description: Mentor applications (Academy-grown and external professionals),
-- an append-only review trail, approved mentor profiles and per-specialization
-- qualifications. Additive only; no existing table is modified.
--
-- Invariants enforced here (not only in application code):
--   * one open application per applicant;
--   * a decision always records who decided and when;
--   * one active qualification per (mentor, specialization);
--   * mentor tiers are granted, never derived from XP;
--   * deleting an account cascades its mentor data; deleting a reviewer keeps
--     the decision but nulls the reviewer reference.

CREATE TABLE IF NOT EXISTS mentor_applications (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  applicant_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  track VARCHAR(16) NOT NULL CHECK (track IN ('academy', 'external')),
  status VARCHAR(24) NOT NULL DEFAULT 'submitted'
    CHECK (status IN ('submitted', 'under_review', 'changes_requested', 'approved', 'rejected', 'withdrawn')),
  headline VARCHAR(120) NOT NULL CHECK (char_length(btrim(headline)) >= 8),
  bio TEXT NOT NULL CHECK (char_length(bio) BETWEEN 80 AND 4000),
  specializations TEXT[] NOT NULL CHECK (cardinality(specializations) BETWEEN 1 AND 6),
  years_experience SMALLINT NOT NULL DEFAULT 0 CHECK (years_experience BETWEEN 0 AND 60),
  teaching_background TEXT NOT NULL DEFAULT '' CHECK (char_length(teaching_background) <= 2000),
  motivation TEXT NOT NULL CHECK (char_length(motivation) BETWEEN 40 AND 2000),
  credentials JSONB NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(credentials) = 'array' AND jsonb_array_length(credentials) <= 10),
  profile_url TEXT CHECK (profile_url IS NULL OR (profile_url ~ '^https://' AND char_length(profile_url) <= 300)),
  timezone VARCHAR(64) NOT NULL,
  eligibility_snapshot JSONB NOT NULL DEFAULT '{}'::jsonb,
  code_of_conduct_version VARCHAR(16) NOT NULL,
  code_of_conduct_accepted_at TIMESTAMPTZ NOT NULL,
  decision_note VARCHAR(1000),
  reviewer_note VARCHAR(2000),
  decided_by UUID REFERENCES users(id) ON DELETE SET NULL,
  decided_at TIMESTAMPTZ,
  submitted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT mentor_applications_decision_recorded CHECK (
    status NOT IN ('approved', 'rejected') OR decided_at IS NOT NULL
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_mentor_applications_one_open_per_applicant
  ON mentor_applications(applicant_id)
  WHERE status IN ('submitted', 'under_review', 'changes_requested');
CREATE INDEX IF NOT EXISTS idx_mentor_applications_queue
  ON mentor_applications(status, submitted_at);
CREATE INDEX IF NOT EXISTS idx_mentor_applications_applicant
  ON mentor_applications(applicant_id, created_at DESC);

CREATE TABLE IF NOT EXISTS mentor_application_events (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  application_id UUID NOT NULL REFERENCES mentor_applications(id) ON DELETE CASCADE,
  applicant_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  actor_id UUID REFERENCES users(id) ON DELETE SET NULL,
  actor_kind VARCHAR(16) NOT NULL CHECK (actor_kind IN ('applicant', 'admin', 'system')),
  from_status VARCHAR(24),
  to_status VARCHAR(24) NOT NULL,
  note VARCHAR(1000),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_mentor_application_events_application
  ON mentor_application_events(application_id, created_at);

CREATE TABLE IF NOT EXISTS mentor_profiles (
  user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  application_id UUID REFERENCES mentor_applications(id) ON DELETE SET NULL,
  track VARCHAR(16) NOT NULL CHECK (track IN ('academy', 'external')),
  tier VARCHAR(24) NOT NULL CHECK (tier IN ('approved_peer_mentor', 'verified_mentor', 'senior_mentor')),
  status VARCHAR(16) NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'paused', 'suspended', 'revoked')),
  headline VARCHAR(120) NOT NULL,
  bio TEXT NOT NULL CHECK (char_length(bio) <= 4000),
  timezone VARCHAR(64) NOT NULL,
  availability_note VARCHAR(500) NOT NULL DEFAULT '',
  verified_credentials JSONB NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(verified_credentials) = 'array'),
  is_listed BOOLEAN NOT NULL DEFAULT true,
  status_reason VARCHAR(500),
  status_changed_by UUID REFERENCES users(id) ON DELETE SET NULL,
  status_changed_at TIMESTAMPTZ,
  approved_by UUID REFERENCES users(id) ON DELETE SET NULL,
  approved_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_mentor_profiles_directory
  ON mentor_profiles(tier, approved_at DESC)
  WHERE status = 'active' AND is_listed = true;

CREATE TABLE IF NOT EXISTS mentor_qualifications (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  mentor_id UUID NOT NULL REFERENCES mentor_profiles(user_id) ON DELETE CASCADE,
  specialization_id VARCHAR(48) NOT NULL,
  basis VARCHAR(24) NOT NULL CHECK (basis IN ('academy_evidence', 'professional_review')),
  evidence_snapshot JSONB NOT NULL DEFAULT '{}'::jsonb,
  status VARCHAR(16) NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'revoked')),
  granted_by UUID REFERENCES users(id) ON DELETE SET NULL,
  granted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  revoked_by UUID REFERENCES users(id) ON DELETE SET NULL,
  revoked_at TIMESTAMPTZ,
  revocation_reason VARCHAR(500),
  CONSTRAINT mentor_qualifications_revocation_recorded CHECK (
    status <> 'revoked' OR revoked_at IS NOT NULL
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_mentor_qualifications_one_active
  ON mentor_qualifications(mentor_id, specialization_id)
  WHERE status = 'active';
CREATE INDEX IF NOT EXISTS idx_mentor_qualifications_specialization
  ON mentor_qualifications(specialization_id)
  WHERE status = 'active';

COMMENT ON TABLE mentor_applications IS
  'Mentor applications. Approval is an administrator decision; eligibility snapshots record the Academy evidence seen at submission.';
COMMENT ON COLUMN mentor_applications.reviewer_note IS
  'Internal reviewer note. Never returned to the applicant or exported.';
COMMENT ON TABLE mentor_profiles IS
  'Approved mentors. Tier is granted by an administrator and is never derived from XP or subscription status.';
COMMENT ON TABLE mentor_qualifications IS
  'Per-specialization mentoring qualifications. Academy-track grants require demonstrated capability evidence.';
