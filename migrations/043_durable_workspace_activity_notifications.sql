-- Durable workspace continuity for signed-in users.
-- Browser-local activity remains the optimistic/offline cache; these tables make
-- recent work, activity and operational notifications available across devices.

CREATE TABLE IF NOT EXISTS workspace_activity_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    owner_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    client_event_id VARCHAR(96) NOT NULL,
    label VARCHAR(160) NOT NULL,
    detail VARCHAR(320),
    href VARCHAR(320),
    color VARCHAR(24) NOT NULL,
    kind VARCHAR(24) NOT NULL,
    occurred_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT workspace_activity_color_check
      CHECK (color IN ('home','labs','live','collab','boards','vault','manage')),
    CONSTRAINT workspace_activity_kind_check
      CHECK (kind IN ('navigation','action','system')),
    CONSTRAINT workspace_activity_client_event_unique UNIQUE (owner_id, client_event_id)
);

CREATE INDEX IF NOT EXISTS idx_workspace_activity_owner_occurred
    ON workspace_activity_events(owner_id, occurred_at DESC);

CREATE TABLE IF NOT EXISTS workspace_recent_workspaces (
    owner_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    href VARCHAR(320) NOT NULL,
    label VARCHAR(160) NOT NULL,
    color VARCHAR(24) NOT NULL,
    last_visited_at TIMESTAMPTZ NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (owner_id, href),
    CONSTRAINT workspace_recent_color_check
      CHECK (color IN ('home','labs','live','collab','boards','vault','manage'))
);

CREATE INDEX IF NOT EXISTS idx_workspace_recents_owner_visited
    ON workspace_recent_workspaces(owner_id, last_visited_at DESC);

CREATE TABLE IF NOT EXISTS workspace_notifications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    owner_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    notification_type VARCHAR(80) NOT NULL,
    title VARCHAR(160) NOT NULL,
    detail VARCHAR(320),
    href VARCHAR(320),
    severity VARCHAR(16) NOT NULL DEFAULT 'info',
    source_type VARCHAR(80),
    source_id VARCHAR(160),
    dedupe_key VARCHAR(240),
    read_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT workspace_notification_severity_check
      CHECK (severity IN ('info','success','warning','error')),
    CONSTRAINT workspace_notification_dedupe_unique UNIQUE (owner_id, dedupe_key)
);

CREATE INDEX IF NOT EXISTS idx_workspace_notifications_owner_created
    ON workspace_notifications(owner_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_workspace_notifications_owner_unread
    ON workspace_notifications(owner_id, created_at DESC)
    WHERE read_at IS NULL;
