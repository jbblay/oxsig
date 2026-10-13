-- Migration 058: identity lifecycle integrity + repair of schema drift.
--
-- Numbered 058 so it cannot collide with open PR #218 (057_platform_admin_...).
-- Every statement is idempotent and additive; application code tolerates this
-- migration not being applied yet (it feature-detects the new tables).

-- ---------------------------------------------------------------------------
-- 1. Clerk identity tombstones.
--    A deleted Clerk identity must never be re-provisioned as a fresh, empty
--    OXSIG account (late/out-of-order user.created / user.updated webhooks, or
--    a still-valid session after self-service deletion).
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS clerk_identity_tombstones (
    clerk_user_id TEXT PRIMARY KEY,
    deleted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    source VARCHAR(32) NOT NULL DEFAULT 'clerk_webhook'
        CHECK (source IN ('clerk_webhook', 'self_service', 'admin', 'test_reset'))
);

COMMENT ON TABLE clerk_identity_tombstones IS
    'Clerk identities that were deleted. upsertClerkUser refuses to (re)create accounts for these identities.';

-- ---------------------------------------------------------------------------
-- 2. Webhook idempotency + ordering.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS clerk_webhook_deliveries (
    svix_id TEXT PRIMARY KEY,
    event_type VARCHAR(64) NOT NULL,
    clerk_user_id TEXT,
    received_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_clerk_webhook_deliveries_received
    ON clerk_webhook_deliveries(received_at);

COMMENT ON TABLE clerk_webhook_deliveries IS
    'Processed Clerk (Svix) webhook message ids; duplicates are acknowledged without reprocessing. Rows older than 30 days are pruned.';

ALTER TABLE users ADD COLUMN IF NOT EXISTS clerk_source_updated_at TIMESTAMPTZ;

COMMENT ON COLUMN users.clerk_source_updated_at IS
    'Clerk user.updated_at of the newest applied snapshot. Older webhook snapshots are ignored.';

-- ---------------------------------------------------------------------------
-- 3. Drift repair: migration 037 was edited after it had been applied
--    (commit f2e8608). Databases migrated before that edit lack the
--    single-active-controller backstop and the decided_at invariant.
-- ---------------------------------------------------------------------------

-- 3a. Expire lapsed active leases, then revoke all but the newest duplicate
--     active lease per (binding, surface) so the unique index can be built.
UPDATE live_workspace_control_leases
   SET status = 'expired', updated_at = NOW()
 WHERE status = 'active' AND expires_at <= NOW();

WITH ranked AS (
    SELECT id,
           ROW_NUMBER() OVER (
               PARTITION BY resource_binding_id, surface
               ORDER BY granted_at DESC, id DESC
           ) AS position
      FROM live_workspace_control_leases
     WHERE status = 'active'
)
UPDATE live_workspace_control_leases lease
   SET status = 'revoked',
       revoked_at = NOW(),
       revocation_reason = 'schema_integrity_repair',
       updated_at = NOW()
  FROM ranked
 WHERE lease.id = ranked.id AND ranked.position > 1;

CREATE UNIQUE INDEX IF NOT EXISTS idx_live_workspace_control_leases_one_active_controller
    ON live_workspace_control_leases(resource_binding_id, surface)
    WHERE status = 'active';

-- 3b. Decided control requests must record when they were decided.
UPDATE live_workspace_control_requests
   SET decided_at = COALESCE(decided_at, updated_at, requested_at)
 WHERE status <> 'pending' AND decided_at IS NULL;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
         WHERE conname = 'live_workspace_control_requests_decided_at_check'
           AND conrelid = 'live_workspace_control_requests'::regclass
    ) THEN
        ALTER TABLE live_workspace_control_requests
            ADD CONSTRAINT live_workspace_control_requests_decided_at_check
            CHECK (status = 'pending' OR decided_at IS NOT NULL);
    END IF;
END $$;

-- ---------------------------------------------------------------------------
-- 4. Account deletion must not depend on hand-written FK patch-ups.
--    collaboration_members.invited_by (004/017) has no ON DELETE action, so
--    deleting an inviting user fails unless every caller nulls it first.
-- ---------------------------------------------------------------------------
DO $$
DECLARE
    fk RECORD;
BEGIN
    FOR fk IN
        SELECT con.conname
          FROM pg_constraint con
          JOIN pg_attribute att
            ON att.attrelid = con.conrelid AND att.attnum = ANY (con.conkey)
         WHERE con.contype = 'f'
           AND con.conrelid = 'collaboration_members'::regclass
           AND con.confrelid = 'users'::regclass
           AND att.attname = 'invited_by'
           AND con.confdeltype <> 'n'  -- 'n' = SET NULL
    LOOP
        EXECUTE format('ALTER TABLE collaboration_members DROP CONSTRAINT %I', fk.conname);
    END LOOP;

    IF NOT EXISTS (
        SELECT 1
          FROM pg_constraint con
          JOIN pg_attribute att
            ON att.attrelid = con.conrelid AND att.attnum = ANY (con.conkey)
         WHERE con.contype = 'f'
           AND con.conrelid = 'collaboration_members'::regclass
           AND con.confrelid = 'users'::regclass
           AND att.attname = 'invited_by'
    ) THEN
        ALTER TABLE collaboration_members
            ADD CONSTRAINT collaboration_members_invited_by_fkey
            FOREIGN KEY (invited_by) REFERENCES users(id) ON DELETE SET NULL;
    END IF;
END $$;
