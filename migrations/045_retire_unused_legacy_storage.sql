-- Migration 045: retire confirmed unused legacy storage and auth subsystems
--
-- These relations are historical remnants of pre-Clerk auth/recovery,
-- document-signing, WebRTC, and legacy file-sharing implementations. Current
-- runtime storage is owned by Clerk-backed users, vault_items, storyboards,
-- collaborations/live workspaces, and the current lab/operation model.
--
-- Safety contract: never silently destroy retained legacy data. Every relation
-- targeted by this migration must either be absent or empty. Older production
-- databases may already lack some of these historical relations, while a fresh
-- replay still creates them in migrations 001-009. CREATE TABLE IF NOT EXISTS
-- gives absent relations a transaction-local retirement placeholder so one
-- plain-SQL guard can verify every target without procedural DO blocks. The
-- migration runner wraps this file in a transaction, so a failed guard rolls
-- the placeholders back with the rest of the migration.

CREATE TABLE IF NOT EXISTS public.document_shares (_migration_045_placeholder boolean);
CREATE TABLE IF NOT EXISTS public.signatures (_migration_045_placeholder boolean);
CREATE TABLE IF NOT EXISTS public.collaboration_documents (_migration_045_placeholder boolean);
CREATE TABLE IF NOT EXISTS public.collaboration_activity (_migration_045_placeholder boolean);
CREATE TABLE IF NOT EXISTS public.documents (_migration_045_placeholder boolean);
CREATE TABLE IF NOT EXISTS public.webrtc_sessions (_migration_045_placeholder boolean);
CREATE TABLE IF NOT EXISTS public.file_shares (_migration_045_placeholder boolean);
CREATE TABLE IF NOT EXISTS public.files (_migration_045_placeholder boolean);
CREATE TABLE IF NOT EXISTS public.oauth_accounts (_migration_045_placeholder boolean);
CREATE TABLE IF NOT EXISTS public.recovery_session_shares (_migration_045_placeholder boolean);
CREATE TABLE IF NOT EXISTS public.recovery_sessions (_migration_045_placeholder boolean);
CREATE TABLE IF NOT EXISTS public.recovery_packages (_migration_045_placeholder boolean);
CREATE TABLE IF NOT EXISTS public.webauthn_challenges (_migration_045_placeholder boolean);
CREATE TABLE IF NOT EXISTS public.webauthn_credentials (_migration_045_placeholder boolean);
CREATE TABLE IF NOT EXISTS public.user_crypto_keys (_migration_045_placeholder boolean);
CREATE TABLE IF NOT EXISTS public.paired_devices (_migration_045_placeholder boolean);

CREATE TEMP TABLE migration_045_data_guard (
  is_empty boolean NOT NULL CHECK (is_empty)
);

INSERT INTO migration_045_data_guard (is_empty)
SELECT NOT EXISTS (
  SELECT 1 FROM public.document_shares
  UNION ALL SELECT 1 FROM public.signatures
  UNION ALL SELECT 1 FROM public.collaboration_documents
  UNION ALL SELECT 1 FROM public.collaboration_activity
  UNION ALL SELECT 1 FROM public.documents
  UNION ALL SELECT 1 FROM public.webrtc_sessions
  UNION ALL SELECT 1 FROM public.file_shares
  UNION ALL SELECT 1 FROM public.files
  UNION ALL SELECT 1 FROM public.oauth_accounts
  UNION ALL SELECT 1 FROM public.recovery_session_shares
  UNION ALL SELECT 1 FROM public.recovery_sessions
  UNION ALL SELECT 1 FROM public.recovery_packages
  UNION ALL SELECT 1 FROM public.webauthn_challenges
  UNION ALL SELECT 1 FROM public.webauthn_credentials
  UNION ALL SELECT 1 FROM public.user_crypto_keys
  UNION ALL SELECT 1 FROM public.paired_devices
);

DROP TABLE migration_045_data_guard;

-- Remove explicit dependents before their parent relations. Do not use CASCADE:
-- any unexpected dependency should fail loudly and be audited rather than
-- disappearing implicitly.
DROP TABLE IF EXISTS recovery_session_shares;
DROP TABLE IF EXISTS recovery_sessions;
DROP TABLE IF EXISTS recovery_packages;

DROP TABLE IF EXISTS webauthn_challenges;
DROP TABLE IF EXISTS webauthn_credentials;
DROP FUNCTION IF EXISTS cleanup_expired_webauthn_challenges();

DROP TABLE IF EXISTS paired_devices;
DROP TABLE IF EXISTS user_crypto_keys;

DROP TABLE IF EXISTS collaboration_documents;
DROP TABLE IF EXISTS collaboration_activity;
DROP TABLE IF EXISTS document_shares;
DROP TABLE IF EXISTS signatures;
DROP TABLE IF EXISTS documents;

DROP TABLE IF EXISTS file_shares;
DROP TABLE IF EXISTS files;
DROP TABLE IF EXISTS webrtc_sessions;

DROP TABLE IF EXISTS oauth_accounts;

-- Intentionally retained historical relations with live data/provenance:
-- sessions, schema_migrations, oxisg_auth_bootstrap.
-- update_updated_at_column() is also retained because active users still use it.
