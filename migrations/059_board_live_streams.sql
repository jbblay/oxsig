-- Short-lived signaling leases. Audio and video are never stored here.
CREATE TABLE storyboard_stream_sessions (
 id UUID PRIMARY KEY,
 board_id UUID NOT NULL REFERENCES storyboard_sessions(id) ON DELETE CASCADE,
 user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 presenter BOOLEAN NOT NULL DEFAULT FALSE,
 expires_at TIMESTAMPTZ NOT NULL DEFAULT NOW() + INTERVAL '20 seconds'
);
CREATE UNIQUE INDEX storyboard_stream_presenter ON storyboard_stream_sessions(board_id) WHERE presenter;
CREATE TABLE storyboard_stream_signals (
 id BIGSERIAL PRIMARY KEY,
 sender_session UUID NOT NULL REFERENCES storyboard_stream_sessions(id) ON DELETE CASCADE,
 recipient_session UUID NOT NULL REFERENCES storyboard_stream_sessions(id) ON DELETE CASCADE,
 kind TEXT NOT NULL CHECK (kind IN ('offer','answer','ice')),
 payload JSONB NOT NULL,
 created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX storyboard_stream_inbox ON storyboard_stream_signals(recipient_session, id);
