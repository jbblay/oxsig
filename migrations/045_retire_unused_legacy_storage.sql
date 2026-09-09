-- Migration 045: retire confirmed unused legacy storage and auth subsystems
--
-- These relations are historical remnants of pre-Clerk auth/recovery,
-- document-signing, WebRTC, and legacy file-sharing implementations. Current
-- runtime storage is owned by Clerk-backed users, vault_items, storyboards,
-- collaborations/live workspaces, and the current lab/operation model.
--
-- Safety contract: never silently destroy retained legacy data. Every relation
-- targeted by this migration must either be absent or empty. If an older
-- environment still contains rows, migration stops and requires an explicit
-- retention/migration decision for that environment.

DO $$
DECLARE
  relation_name text;
  has_rows boolean;
BEGIN
  FOREACH relation_name IN ARRAY ARRAY[
    'document_shares',
    'signatures',
    'collaboration_documents',
    'collaboration_activity',
    'documents',
    'webrtc_sessions',
    'file_shares',
    'files',
    'oauth_accounts',
    'recovery_session_shares',
    'recovery_sessions',
    'recovery_packages',
    'webauthn_challenges',
    'webauthn_credentials',
    'user_crypto_keys',
    'paired_devices'
  ]
  LOOP
    IF to_regclass(format('public.%I', relation_name)) IS NOT NULL THEN
      EXECUTE format('SELECT EXISTS (SELECT 1 FROM public.%I LIMIT 1)', relation_name)
        INTO has_rows;
      IF has_rows THEN
        RAISE EXCEPTION
          'Refusing to retire legacy relation % because it still contains data',
          relation_name;
      END IF;
    END IF;
  END LOOP;
END
$$;

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
