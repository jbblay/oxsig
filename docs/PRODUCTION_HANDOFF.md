# OXSIG Production Handoff

Last updated: 2026-09-05

This file exists so a fresh ChatGPT/session or maintainer can resume OXSIG without relying on prior conversation history.

## Canonical repository and branch rule

Repository: `jbblay/oxsig`

`main` is always the canonical OXSIG application after a feature/production PR is merged. Do not audit stale historical branches as the current product.

At the time this handoff was written, `main` was at `f5eab6fac64a07b4436293b9501b985878d1c670` (merged PR #58, Storyboard S3 audio).

The only active production slice still ahead of that main is:

- Branch: `production/vercel-terminal-websocket`
- Pre-handoff implementation head: `90f8c0b576ab22b7691700f43746f43099f1cd58`
- PR: #59, `Productionize terminal WebSocket transport for Vercel`
- Base: `main`

This documentation commit advances the PR head beyond the pre-handoff implementation SHA. Before merging, require CI on the exact current PR head to be green. Merge only after that. After merge, fetch `main` and treat the resulting merge commit as the new canonical audit baseline.

## Terminal transport state

The production branch adds a Vercel-native App Router WebSocket endpoint at `src/app/__oxsig/terminal-bridge/route.ts` using `experimental_upgradeWebSocket` from `@vercel/functions`. It preserves the existing custom `server.mjs` WebSocket bridge for local/custom Node deployments.

The Vercel route performs encrypted terminal-ticket verification, PostgreSQL one-time ticket consumption, same-origin checks, AWS SSM stream URL validation, SigV4 upstream authentication, buffering limits, handshake timeout, keepalive, and Sentry error capture. AWS credentials and the SSM stream URL remain server-side.

Important: a Vercel WebSocket can end when its Function is recycled or reaches its duration limit. Client automatic reconnect/session continuity is a separate remaining hardening item unless a later commit/PR explicitly implements and tests it. The existing terminal historically has manual reconnect. Do not claim shell continuity exists without fresh code verification.

## Production work already merged before PR #59

Production foundation/correctness, Academy persistence, Academy sessions/mastery, collaboration email invitations, Ably realtime collaboration, Sentry observability, scheduled lab cleanup, PostHog server-side analytics, frozen lockfile CI, production readiness checks, durable PostgreSQL lab topology, and Storyboard S3 audio were already merged to canonical main before this handoff.

Latest tracked database migration on the pre-PR-59 main is `026_storyboard_audio_storage.sql`. Do not assume a deployed Neon database has applied migrations merely because migration files exist in Git.

Storyboard legacy database audio migration is separate from schema migration and uses `pnpm storyboards:migrate-audio`.

## Environment contract

Use `.env.example` as the authoritative current contract. Never paste real secrets into chat or commit them.

Core/application variables:

- `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`
- `CLERK_SECRET_KEY`
- `CLERK_WEBHOOK_SIGNING_SECRET`
- `DATABASE_URL`
- `OXSIG_APP_URL`
- `CRON_SECRET`
- `OXSIG_TERMINAL_BRIDGE_SECRET`
- `OPENAI_API_KEY`
- optional `OXSIG_AI_MODEL`

Storage:

- `STORAGE_BUCKET`
- `STORAGE_REGION`
- `STORAGE_MAX_UPLOAD_BYTES`
- `STORYBOARD_MAX_AUDIO_BYTES`
- `COLLAB_MAX_ATTACHMENT_BYTES`

Labs/AWS:

- `LAB_AWS_ENABLED`
- `LAB_AWS_REGION`
- `LAB_AWS_SUBNET_ID`
- `LAB_AWS_SECURITY_GROUP_ID`
- `LAB_AWS_TTL_MINUTES`
- `LAB_AWS_INSTANCE_PROFILE`
- `LAB_AWS_INSTANCE_TYPE`
- optional per-OS AMI and instance-type overrides documented in `.env.example`
- local-only `AWS_PROFILE`; production should use IAM/OIDC rather than a developer profile

Optional provider activation:

- Resend: `RESEND_API_KEY`, `EMAIL_FROM`
- Ably: `ABLY_API_KEY`
- Sentry: `SENTRY_DSN`, `NEXT_PUBLIC_SENTRY_DSN`, with `SENTRY_ORG`, `SENTRY_PROJECT`, `SENTRY_AUTH_TOKEN` for source-map upload
- PostHog: `POSTHOG_PROJECT_TOKEN`, `POSTHOG_HOST`

Optional providers should disable only their own capability when unconfigured, not crash the whole application.

## Local startup

Canonical local workflow after the active PR is merged:

```bash
git switch main
git pull --ff-only origin main
pnpm dev:up
```

`pnpm dev:up` is expected to use canonical main by default, perform frozen-lockfile installation when appropriate, run database migrations, validate the configured AWS SSO/profile/account, and start development. `pnpm dev` alone does not apply migrations.

Do not overwrite an existing `.env.local`; merge required keys into it.

## Remaining production gates after PR #59

Freshly verify rather than assume completion:

- PR #59 exact-head CI and merge to `main`.
- Live deployed Vercel terminal test against a real owned/running AWS SSM lab.
- Automatic terminal reconnect/session-continuity behavior across Function recycling/duration limits.
- Browser desktop lab transport, or intentionally hide/disable desktop mode until production-ready.
- Production database migrations and Storyboard legacy-audio migration actually executed where required.
- External provider credentials/resources activated and tested end-to-end.
- AWS production identity/IAM/OIDC and least-privilege permissions verified.
- Branch protection/ruleset on `main`; it was still unprotected when this handoff was written.
- Final security/operations audit, dead-code/stale-doc cleanup, and release QA.
- Academy mastery scoring semantics and Q&A/practice history UI polish should be freshly assessed; these are product-quality follow-ups rather than assumed blockers.

## Final audit instructions for a new session

Start from GitHub, not conversation memory. Read this file, `.env.example`, `package.json`, migration files, CI workflows, `scripts/production-check.mjs`, `scripts/readiness.mjs`, current open PRs, and the current `main` head. If PR #59 has merged, audit current `main`. If it has not merged, inspect PR #59 and its exact-head CI first, merge only if green, then audit the resulting `main`.

For the final audit, verify actual code and live configuration separately. A committed integration is not proof that the external provider is configured, a database migration is applied, or a production E2E path works.

Target audit flow: codebase architecture and dead code; auth/security boundaries; database/migrations; Clerk; Academy/AI Practitioner; AWS labs and SSM terminal; desktop labs; S3/Storyboard/Vault/collaboration media; Resend/Ably/Sentry/PostHog/OpenAI; scheduler/cleanup; CI/dependency reproducibility; production health/readiness; live E2E; documentation; final release score out of 100.
