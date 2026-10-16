-- Additive evidence and review records. No payments or automatic entitlements.
CREATE TABLE mentor_forge_attempts (
 id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
 owner_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 application_id UUID NOT NULL REFERENCES mentor_applications(id) ON DELETE CASCADE,
 template_version TEXT NOT NULL CHECK (template_version='docker-ports-v1'),
 rubric_version TEXT NOT NULL CHECK (rubric_version='teaching-v1'),
 explanation TEXT NOT NULL CHECK (length(explanation) BETWEEN 40 AND 4000),
 questions TEXT NOT NULL CHECK (length(questions) BETWEEN 20 AND 2000),
 reasoning TEXT NOT NULL CHECK (length(reasoning) BETWEEN 40 AND 4000),
 status TEXT NOT NULL DEFAULT 'submitted' CHECK(status IN ('submitted','accepted','changes_requested','rejected')),
 scores JSONB,
 reason TEXT,
 reviewer_id UUID REFERENCES users(id) ON DELETE SET NULL,
 decided_at TIMESTAMPTZ,
 created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 CHECK(reviewer_id IS NULL OR reviewer_id<>owner_id),
 CHECK(status='submitted' OR (reason IS NOT NULL AND decided_at IS NOT NULL))
);
CREATE UNIQUE INDEX mentor_forge_pending ON mentor_forge_attempts(owner_id) WHERE status='submitted';
CREATE INDEX mentor_forge_owner ON mentor_forge_attempts(owner_id,created_at);
CREATE TABLE mentorship_attendance (
 session_id UUID NOT NULL REFERENCES mentorship_sessions(id) ON DELETE CASCADE,
 owner_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 joined_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 PRIMARY KEY(session_id,owner_id)
);
CREATE TABLE mentorship_help_outcomes (
 id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
 session_id UUID NOT NULL REFERENCES mentorship_sessions(id) ON DELETE CASCADE,
 owner_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 role TEXT NOT NULL CHECK(role IN ('learner','mentor')),
 outcome TEXT NOT NULL CHECK(outcome IN ('resolved','progress','unresolved')),
 rating SMALLINT NOT NULL CHECK(rating BETWEEN 1 AND 5),
 reflection TEXT NOT NULL CHECK(length(reflection) BETWEEN 20 AND 2000),
 created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 UNIQUE(session_id,role)
);
CREATE TABLE mentorship_reviews (
 id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
 owner_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 subject_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 kind TEXT NOT NULL CHECK(kind IN ('report','appeal','quality')),
 session_id UUID REFERENCES mentorship_sessions(id) ON DELETE CASCADE,
 forge_id UUID REFERENCES mentor_forge_attempts(id) ON DELETE CASCADE,
 parent_id UUID REFERENCES mentorship_reviews(id) ON DELETE CASCADE,
 detail TEXT NOT NULL CHECK(length(detail) BETWEEN 20 AND 2000),
 status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','upheld','dismissed')),
 reason TEXT,
 reviewer_id UUID REFERENCES users(id) ON DELETE SET NULL,
 decided_at TIMESTAMPTZ,
 created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 CHECK(reviewer_id IS NULL OR (reviewer_id<>owner_id AND reviewer_id<>subject_id)),
 CHECK(status='pending' OR (reason IS NOT NULL AND decided_at IS NOT NULL))
);
CREATE UNIQUE INDEX mentorship_one_appeal_review ON mentorship_reviews(owner_id,parent_id) WHERE kind='appeal';
CREATE UNIQUE INDEX mentorship_one_appeal_forge ON mentorship_reviews(owner_id,forge_id) WHERE kind='appeal';
CREATE UNIQUE INDEX mentorship_one_quality ON mentorship_reviews(session_id) WHERE kind='quality';
CREATE TABLE mentorship_evidence_events (
 id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
 owner_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 actor_id UUID REFERENCES users(id) ON DELETE SET NULL,
 resource_id UUID NOT NULL,
 action TEXT NOT NULL,
 detail JSONB NOT NULL DEFAULT '{}',
 created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE skills_passport_shares (
 id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
 owner_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 token_hash TEXT NOT NULL UNIQUE,
 consent_version TEXT NOT NULL CHECK(consent_version='passport-v1'),
 expires_at TIMESTAMPTZ NOT NULL,
 revoked_at TIMESTAMPTZ,
 created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 CHECK(expires_at>created_at AND expires_at<=created_at+INTERVAL '7 days')
);
