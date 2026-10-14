# CI and release security

## Authoritative CI provider

OXSIG uses AWS CodeBuild project `oxsig-ci`. The repository-owned source of truth is the root `buildspec.yml`; GitHub is the source and pull-request host, not the build runner.

CodeBuild uses Node.js 22 and pnpm 10.28.0, installs the frozen lockfile, provisions a disposable PostgreSQL 16 (`scripts/ci/provision-postgres.sh`: Docker if available, otherwise apt/dnf), and runs:

1. `pnpm server:check` — `node --check` on every `scripts/**/*.mjs` and `server.mjs`, `bash -n` on shell scripts
2. `pnpm typecheck`
3. `pnpm audit:reachability`
4. `pnpm persistence:check`
5. `pnpm env:contract`
6. `pnpm test:run` — vitest plus the `node:test` suites in `scripts/tests/` (production regressions, migration integrity)
7. `pnpm db:verify` — replays every migration on the empty database, re-runs the migrator (must be a no-op), runs schema parity, compares ledger checksums with `migrations/checksums.json`, rejects `users` foreign keys without an `ON DELETE` action, exercises real application SQL (Clerk provisioning, Vault optimistic concurrency, account deletion) in a rolled-back transaction, and runs `src/lib/db/pool.integration.test.ts`
8. `pnpm build`

Browser E2E checks need Clerk-free E2E mode and Playwright browsers and are not part of this gate. Run them intentionally when the change requires them.

## Migration rules

- Merged migrations are immutable. `migrations/checksums.json` records each file's SHA-256 and `scripts/tests/migrations-integrity.mjs` fails on edits, deletions, renames and unlisted new files. Fix schema with a new forward migration.
- After adding a migration, print the updated manifest with `node scripts/tests/migrations-integrity.mjs --print-manifest`.
- New numeric prefixes must be unique (the historical `049` pair is grandfathered).
- Every new foreign key to `users(id)` must declare `ON DELETE`.
- Application SQL may not reference tables retired by migrations, and every table it uses must be listed in `REQUIRED_RUNTIME_RELATIONS` (`scripts/schema-parity-lib.mjs`).

## Trigger contract

The CodeBuild webhook is expected to build:

- pull-request create/update/reopen events targeting `main`;
- pushes to `main`.

The reported GitHub status context is `AWS CodeBuild / oxsig-ci`.

## Reproduce CI locally

```bash
corepack enable
corepack prepare pnpm@10.28.0 --activate
pnpm install --frozen-lockfile
pnpm server:check
pnpm typecheck
pnpm audit:reachability
pnpm persistence:check
pnpm env:contract
pnpm test:run
OXSIG_CI_DATABASE_URL=postgresql://... pnpm db:verify   # disposable, empty database only
pnpm build
```

If CodeBuild fails, reproduce the failing command locally first. Use the CodeBuild phase message to distinguish dependency-install failures from verification failures, then inspect the CloudWatch log stream linked from the build.

## Deployment boundary

CodeBuild verifies source; it does not mean a Vercel deployment succeeded. Treat CI and deployment as separate states:

```text
pull request -> CodeBuild verification -> merge to main -> CodeBuild main verification -> deployment
```

Do not describe a deployment as live until the hosting provider reports a successful deployment for the expected `main` commit.
