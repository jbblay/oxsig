-- Versioned mission runs and append-only, owner-scoped Flight Recorder events.
CREATE TABLE academy_mission_runs (
 id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
 owner_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 template_id TEXT NOT NULL,
 template_version INTEGER NOT NULL CHECK(template_version>0),
 mode TEXT NOT NULL CHECK(mode IN ('practice','troublefest')),
 status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active','verified','expired','abandoned')),
 stage INTEGER NOT NULL DEFAULT 0 CHECK(stage>=0),
 revision INTEGER NOT NULL DEFAULT 0 CHECK(revision>=0),
 lab_instance_id UUID REFERENCES lab_instances(id) ON DELETE SET NULL,
 parent_run_id UUID REFERENCES academy_mission_runs(id) ON DELETE SET NULL,
 fork_revision INTEGER CHECK(fork_revision>=0),
 prepared_at TIMESTAMPTZ,
 deadline TIMESTAMPTZ,
 created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 verified_at TIMESTAMPTZ,
 CHECK(status<>'verified' OR verified_at IS NOT NULL),
 CHECK(mode<>'troublefest' OR deadline IS NOT NULL)
);
CREATE INDEX academy_mission_runs_owner ON academy_mission_runs(owner_id,created_at DESC);
CREATE TABLE academy_flight_events (
 id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
 run_id UUID NOT NULL REFERENCES academy_mission_runs(id) ON DELETE CASCADE,
 owner_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 sequence INTEGER NOT NULL CHECK(sequence>=0),
 event_type TEXT NOT NULL CHECK(event_type IN ('started','hypothesis','prepared','verification','forked','abandoned','expired')),
 summary JSONB NOT NULL,
 created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 UNIQUE(run_id,sequence)
);
CREATE INDEX academy_flight_events_owner ON academy_flight_events(owner_id,created_at);
