# OXSIG Database State Audit

Last audited: 2026-09-09

This audit compares the current `feature/operations-warroom-villain-badges-v1` application contract with the connected Neon database. It separates migration history from actual runtime schema and classifies tables by product ownership.

## Immediate findings

1. The connected Neon database has repository migrations applied through `042_remove_mvp_sample_collaboration.sql` only.
2. This branch contains `043_operation_runs.sql`; `operation_runs` and `operation_nodes` are therefore absent from the connected database until migration 043 is applied.
3. The current Clerk user creation path inserts a fresh internal OXSIG user without `password_hash`, while the connected `users.password_hash` column is still `NOT NULL`. Migration 044 relaxes that legacy-only requirement while retaining a constraint that legacy accounts must keep a password hash.
4. `pnpm db:parity` currently verifies migration-history parity. It does not prove that every historical relation still exists or that no historical table remains unused.
5. Several historical tables are still present even though current application code does not use them as active product storage: `oauth_accounts`, legacy `sessions`, `documents`, `signatures`, `schema_migrations`, and `oxisg_auth_bootstrap`.
6. Historical migration 004 created additional collaboration/file tables (`collaboration_documents`, `webrtc_sessions`, `files`, `file_shares`) that are not present in the connected database. Their absence appears to come from historical cleanup/bootstrap work outside the current numbered migration record, so they must not be recreated blindly.

## Active product tables

These are directly used by current application code or current platform lifecycle logic:

- `users`
- `academy_courses`
- `academy_progress`
- `academy_questions`
- `academy_practice_attempts`
- `academy_sessions`
- `academy_mastery`
- `academy_learning_reflections`
- `academy_instructor_interventions`
- `academy_failure_attempts`
- `learning_activity_days`
- `learning_path_enrollments`
- `learning_capability_evidence`
- `ai_practitioner_events`
- `collaborations`
- `collaboration_members`
- `collaboration_messages`
- `collaboration_invitations`
- `live_workspaces`
- `live_workspace_participants`
- `live_workspace_resources`
- `live_workspace_control_requests`
- `live_workspace_control_leases`
- `lab_definitions`
- `lab_instances`
- `lab_events`
- `lab_topologies`
- `infrastructure_designs`
- `deployment_authorizations`
- `execution_evidence`
- `storyboard_sessions`
- `storyboard_shares`
- `vault_items`
- `terminal_bridge_ticket_uses`
- `rate_limit_buckets`
- `audit_logs`
- `oxisg_schema_migrations`
- after migration 043: `operation_runs`, `operation_nodes`

## Intentionally retained Academy storage

Academy is no longer a primary visible navigation surface, but its persistence is still part of the current learning engine. Current code reads Academy state for adaptive instruction, progress, reflections, program-process assessment, learning-path state, and Live Workspace attachable resources. These tables are therefore dormant in UI terms, not obsolete database structures.

Do not drop Academy tables unless the learning architecture is intentionally redesigned and every dependent API/query is migrated first.

## Historical / cleanup candidates

These relations need a separate deprecation migration, not ad-hoc deletion:

### `oauth_accounts`

No current application code reference was found. Connected database row count is zero.

### `sessions`

Legacy refresh-token session store. Current browser authentication is Clerk. The connected database still contains legacy rows, so this table should be treated as historical data until a retention/deprecation decision is made.

### `documents` and `signatures`

Part of the original document-signing schema. Current Vault uses `vault_items`, and current code search does not show active document/signature product paths. Both connected tables are currently empty.

### `schema_migrations`

Old migration ledger. Current migration tooling uses `oxisg_schema_migrations`. Keep until migration history is formally consolidated.

### `oxisg_auth_bootstrap`

Historical authentication bootstrap ledger not referenced by current repository code. Keep until the old auth bootstrap provenance is documented and retired.

## Test-account reset contract

The Account page now has a testing-only reset capability. It must never `DROP` tables or rebuild the schema.

Reset order:

1. terminate active Operation topology nodes;
2. terminate remaining active user-owned AWS labs;
3. delete user-owned S3 namespaces, Storyboard audio, Collaboration objects, and referenced legacy storage keys;
4. neutralize foreign-key blockers owned by other resources;
5. delete the internal OXSIG `users` row in a transaction, letting reviewed `ON DELETE` relationships clear user-owned relational state;
6. sign the browser out of Clerk while leaving the external Clerk account intact;
7. next Clerk sign-in creates a new internal OXSIG UUID and starts with fresh product state.

The reset endpoint is enabled automatically for local development and Vercel Preview deployments. Production requires explicit `OXSIG_TEST_RESET_ENABLED=true`.

## Production actions still requiring explicit approval

- apply migration 043 to create Operation runtime tables;
- apply migration 044 to permit genuinely fresh Clerk users;
- later, create a dedicated deprecation migration for confirmed historical tables after backup/retention review.

No historical table should be dropped merely because it is empty or currently unused.
