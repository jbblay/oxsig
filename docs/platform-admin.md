# Platform admin and account lifecycle

## Rollout

1. Set `OXSIG_FOUNDER_EMAILS` (comma-separated) in Vercel. A signed-in user whose **Clerk-verified** email is in this list is a platform admin. Unverified emails never match.
2. Run `pnpm db:migrate` to apply `057_platform_admin_and_account_lifecycle.sql`. Sign-in keeps working before the migration is applied, but suspension, onboarding, the new profile fields and the admin console need it. **System → Database** in the console reports when it is missing.
3. Deploy. Admins see **Platform → Admin Console** in the sidebar. `/admin` returns 404 for everyone else.

## Admin console (`/admin`)

| Tab | Purpose |
| --- | --- |
| Overview | Users, 7-day activity, live labs, 30-day runtime, sign-up chart, onboarding funnel, alerts for failures and cleanup backlog |
| Users | Search (`/` focuses), filter, sort and paginate. Click a row for the operator record: usage, resources, lifecycle and audit history |
| Labs & operations | Live, expired and failed resources across all users, with force-destroy. Auto-refreshes while the tab is visible |
| Activity | Paginated audit trail with scope filters |
| System | DB health and latency, migration state, cleanup cron freshness and integration presence (never secret values) |

User controls: suspend (optionally terminating resources), restore, make or remove admin, terminate all resources, and permanently delete. Every mutation goes through `withPlatformAdmin` (role check, CSRF, fail-closed rate limit) and is written to `audit_logs` as `admin.*`.

Guardrails: you cannot suspend, delete or demote yourself. Founder accounts cannot be suspended, deleted or demoted from the console. The last admin cannot be removed.

## User lifecycle

- **Sign-up → onboarding:** a new account landing on `/home` sees one optional screen (name, experience, focus areas). Every field is optional, and skipping or closing the screen marks onboarding done. The answers pick the first destination: Academy, Cyber Lab, Operations or WarRoom. Accounts created before migration 057 count as already onboarded.
- **Profile (`/account`):** headline, location, website, experience, focus areas, bio and avatar, plus a completeness meter. Unsaved changes are guarded, and Ctrl/⌘+S saves. Security links to `/account/security` (Clerk: passwords, passkeys, 2FA, sessions).
- **Suspension:** API calls return `403 { code: "ACCOUNT_SUSPENDED" }`, and the app shows a paused-account screen with support and sign-out. Data is untouched.
- **Export:** `GET /api/users/me/export` downloads a JSON copy of everything the user owns. Secrets, binary blobs and runtime internals are stripped.
- **Deletion:** `POST /api/users/me/delete` with `{ "confirmation": "DELETE" }`. It tears down cloud resources and object storage, deletes the user row (which cascades), then deletes the Clerk identity. The database row is removed only after the external cleanup succeeds.
