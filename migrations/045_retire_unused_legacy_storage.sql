-- Migration 045: retire confirmed unused legacy storage
--
-- These relations are remnants of the original OAuth/document-signing model.
-- Current authentication is Clerk-backed and current knowledge persistence is
-- owned by vault_items/storyboards/collaboration resources instead.
--
-- Live Neon audit on 2026-09-09 confirmed all three tables are empty and no
-- current application path references them. Drop signatures first because it
-- references documents. Table-owned indexes and triggers are removed with the
-- tables; update_updated_at_column() is retained because users still uses it.

DROP TABLE IF EXISTS signatures;
DROP TABLE IF EXISTS documents;
DROP TABLE IF EXISTS oauth_accounts;
