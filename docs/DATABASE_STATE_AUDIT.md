# OXSIG Database and Dead-Code Audit

Last audited: 2026-09-09

This audit compares PR #120 (`feature/operations-warroom-villain-badges-v1`) with the connected Neon production branch and with a clean database built from the complete numbered migration history.

## Current database state

The connected Neon database is applied through `045_retire_unused_legacy_storage.sql`.

Confirmed live state:

- `operation_runs` and `operation_nodes` exist.
- `users.password_hash` is nullable for Clerk-created identities.
- `oauth_accounts`, `documents`, `signatures`, and every other relation retired by migration 045 are absent.
- legacy `sessions` is intentionally retained because it contains historical rows.
- legacy `schema_migrations` is intentionally retained for migration provenance.
- `oxisg_auth_bootstrap` is intentionally retained for auth-bootstrap provenance.
- older migration-only recovery, WebAuthn, device-key, document-share, WebRTC, and file-share relations remain absent.

Migration `045_retire_unused_legacy_storage.sql` was rehearsed against a temporary Neon branch cloned from production before being applied to the production parent branch. Its fail-closed data guard verified every targeted relation was absent or empty before retirement. The production schema diff removed only the confirmed legacy relations and their owned indexes, constraints, and document trigger.

## Runtime schema contract

`pnpm db:parity` no longer checks migration filenames alone. It now verifies both:

1. every repository migration is recorded and no unknown migration is recorded;
2. every required runtime relation exists and every explicitly retired relation is absent.

This prevents a database from reporting “in sync” merely because its migration ledger matches while its actual runtime shape is wrong.

## Active runtime relations

The supported runtime contract includes:

- identity and platform: `users`, `audit_logs`, `rate_limit_buckets`, `oxisg_schema_migrations`;
- Academy/learning: `academy_courses`, `academy_progress`, `academy_questions`, `academy_practice_attempts`, `academy_sessions`, `academy_mastery`, `academy_learning_reflections`, `academy_instructor_interventions`, `academy_failure_attempts`, `learning_activity_days`, `learning_path_enrollments`, `learning_capability_evidence`;
- AI: `ai_practitioner_events`;
- collaboration: `collaborations`, `collaboration_members`, `collaboration_messages`, `collaboration_invitations`;
- Live Workspace: `live_workspaces`, `live_workspace_participants`, `live_workspace_resources`, `live_workspace_control_requests`, `live_workspace_control_leases`;
- Cyber Lab / Operations: `lab_definitions`, `lab_instances`, `lab_events`, `lab_topologies`, `operation_runs`, `operation_nodes`, `terminal_bridge_ticket_uses`;
- infrastructure/evidence: `infrastructure_designs`, `deployment_authorizations`, `execution_evidence`;
- knowledge/storyboards: `vault_items`, `storyboard_sessions`, `storyboard_shares`.

Academy persistence remains part of the current learning engine even though Academy is no longer a primary navigation surface. It is not dead schema.

## Explicitly retired schema

Migration 045 retires the following relations after verifying they are empty when present:

- original OAuth/document model: `oauth_accounts`, `documents`, `signatures`, `document_shares`;
- obsolete collaboration/file model: `collaboration_documents`, `collaboration_activity`, `webrtc_sessions`, `files`, `file_shares`;
- pre-Clerk social recovery: `recovery_packages`, `recovery_sessions`, `recovery_session_shares`;
- pre-Clerk WebAuthn storage: `webauthn_credentials`, `webauthn_challenges` plus `cleanup_expired_webauthn_challenges()`;
- obsolete key/device storage: `user_crypto_keys`, `paired_devices`.

Historical migration files are intentionally retained. Deleting old numbered migrations would make clean database reconstruction impossible and would corrupt migration provenance.

## Explicitly retained historical schema

These are not considered safe-to-drop in this audit:

- `sessions` — legacy authentication rows still exist;
- `schema_migrations` — old migration ledger with retained provenance;
- `oxisg_auth_bootstrap` — auth-bootstrap provenance rows remain.

They can be retired only by a separate retention/provenance decision.

## Dead production source removed

The production import graph identified and removed six unreachable source files:

- `src/components/academy/AcademyPathGate.tsx`
- `src/components/app/MobileNav.tsx`
- `src/components/app/TopNav.tsx`
- `src/components/learning/ProgramProcessJourney.tsx`
- `src/components/ui/dropdown-menu.tsx`
- `src/lib/labs/ssm-websocket-presign.ts`

The obsolete `src/lib/labs/ssm-websocket-presign.test.ts` coverage was also removed with its implementation. The now-unused direct dependency `@radix-ui/react-dropdown-menu` was removed. `src/test/setup.ts` was correctly retained as test infrastructure.

CI now runs `pnpm audit:reachability` so newly orphaned production TS/JS files fail validation instead of accumulating silently.

## Operations security correction

Black Domain no longer falls back to the ordinary Cyber Lab security group. Multi-node Operations require `LAB_AWS_OPERATION_SECURITY_GROUP_ID`, and readiness requires that dedicated group to allow all-protocol traffic from itself. Whole-subnet allowance is no longer accepted as an isolation boundary.

This keeps AD/DNS/Kerberos/SMB traffic inside the Operation group without widening the ordinary lab boundary.

## Deliberately not removed

Low PostgreSQL index scan counts were not treated as proof of dead indexes. The production database is low-volume enough that statistics alone are insufficient evidence for destructive index removal.

Historical numbered migrations are also not dead code: they are required to reconstruct the schema from zero.

## Remaining production validation gates

The code, clean-database migration path, and connected Neon production schema are aligned. Remaining live integration validation is environment-dependent:

1. a real three-node Black Domain AWS run must verify provisioning, AD DS promotion, DNS, domain join, SSM operator access, expiry/termination, and complete teardown;
2. the deployed two-user Live Workspace terminal observer/control path still needs a real multi-user acceptance run.

The AWS acceptance run can create billable EC2 resources and must be explicitly authorized before launch.

Shared desktop control and durable WarRoom-to-Live-Workspace Operation/run persistence remain declared product roadmap gaps rather than completed functionality.
