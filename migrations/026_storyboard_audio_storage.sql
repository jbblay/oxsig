-- Move Storyboard audio from PostgreSQL BYTEA storage to private S3 objects.
-- Existing BYTEA rows remain valid until the explicit migration script copies
-- them to S3; all new application writes use audio_storage_key.

ALTER TABLE storyboard_sessions
  ADD COLUMN IF NOT EXISTS audio_storage_key TEXT,
  ADD COLUMN IF NOT EXISTS audio_storage_etag TEXT,
  ADD COLUMN IF NOT EXISTS audio_stored_at TIMESTAMPTZ;

DO $$
DECLARE
  constraint_name TEXT;
BEGIN
  FOR constraint_name IN
    SELECT conname
    FROM pg_constraint
    WHERE conrelid = 'storyboard_sessions'::regclass
      AND contype = 'c'
      AND pg_get_constraintdef(oid) ILIKE '%audio_data%'
  LOOP
    EXECUTE format('ALTER TABLE storyboard_sessions DROP CONSTRAINT %I', constraint_name);
  END LOOP;
END $$;

ALTER TABLE storyboard_sessions
  ADD CONSTRAINT storyboard_sessions_audio_storage_check CHECK (
    (
      audio_data IS NULL
      AND audio_storage_key IS NULL
      AND audio_size IS NULL
      AND audio_mime_type IS NULL
    )
    OR
    (
      audio_data IS NOT NULL
      AND audio_storage_key IS NULL
      AND audio_size = octet_length(audio_data)
      AND audio_size > 0
      AND audio_size <= 4194304
      AND audio_mime_type IS NOT NULL
    )
    OR
    (
      audio_data IS NULL
      AND audio_storage_key IS NOT NULL
      AND length(audio_storage_key) BETWEEN 1 AND 1024
      AND audio_size > 0
      AND audio_size <= 536870912
      AND audio_mime_type IS NOT NULL
    )
  );

CREATE UNIQUE INDEX IF NOT EXISTS idx_storyboard_sessions_audio_storage_key
  ON storyboard_sessions(audio_storage_key)
  WHERE audio_storage_key IS NOT NULL;

COMMENT ON COLUMN storyboard_sessions.audio_storage_key IS
  'Private S3 object key for Storyboard audio. Access is authorized through OXSIG before a short-lived signed URL is issued.';
COMMENT ON COLUMN storyboard_sessions.audio_storage_etag IS
  'S3 ETag captured when the audio object is verified or migrated.';
COMMENT ON TABLE storyboard_sessions IS
  'Protected event-based canvas sessions. New audio is stored privately in S3; legacy BYTEA audio is supported during migration.';
