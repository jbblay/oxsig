# OXSIG Production Handoff

Last updated: 2026-09-05

This file exists so a fresh ChatGPT/session or maintainer can resume OXSIG from repository truth rather than conversation history.

## Canonical repository and branch rule

Repository: `jbblay/oxsig`

`main` is always the canonical OXSIG application after a feature/production PR is merged. Do not audit stale historical branches as the current product.

PR #59, `Productionize terminal WebSocket transport for Vercel`, passed exact-head CI and was merged into `main` as `f634fb5fe526440486c16f527e3871b1ad7fe92f`.

The final code-side hardening slice after that merge is PR #60 from `production/final-runtime-hardening`. It adds bounded terminal transport recovery, intentionally removes desktop advertising until a real browser desktop transport exists, fixes no-practice Academy mastery scoring, and refreshes production documentation. Require exact-head CI to be green before merging #60. After merge, the resulting `main` commit becomes the canonical release baseline.

## Terminal transport state

Production uses a Vercel-native App Router WebSocket endpoint at `src/app/__oxsig/terminal-bridge/route.ts` via `experimental_upgradeWebSocket` from `@vercel/functions`. The existing custom `server.mjs` WebSocket bridge remains for local/custom Node deployments.

The Vercel route performs encrypted terminal-ticket verification, PostgreSQL one-time ticket consumption, same-origin checks, AWS SSM stream URL validation, SigV4 upstream authentication, buffering limits, handshake timeout, keepalive, and Sentry error capture. AWS credentials and the SSM StreamUrl remain server-side.

The final hardening client performs up to three bounded automatic recovery attempts after an unexpected transport interruption. Recovery deliberately obtains a fresh SSM session/ticket rather than replaying a consumed bridge ticket. A fresh SSM shell can reset shell-local state such as the current working directory and exported variables; the UI states this explicitly. Manual disconnect does not trigger automatic recovery.

A live deployed Vercel/AWS test is still required because CI cannot prove behavior across real Vercel Function recycling or AWS SSM data channels.

## Desktop production policy

OXSIG has desktop-capable types and historical provisioning support, but it does not yet have a genuine browser RDP/VNC/noVNC transport. The production lab catalog therefore advertises terminal access only. Do not re-enable desktop access modes until a real browser desktop transport is implemented and live-tested.

## Production work already implemented

The codebase now contains the major production architecture: Clerk auth, Neon persistence, Academy durable courses/progress/Q&A/practice/sessions/mastery/history, AI Practitioner integration, collaboration invitations and Ably realtime fallback, Sentry observability, PostHog analytics foundation, shared PostgreSQL rate limiting, scheduled lab cleanup, durable lab topology, private S3 storage, Storyboard direct-to-S3 audio and legacy migration, AWS EC2/SSM lab runtime, same-origin terminal bridging, terminal replay protection, reproducible pnpm lockfile CI, production configuration checks, and readiness diagnostics.

Academy mastery scoring is defined so courses with required practice use a 70/30 lesson/practice weighting, while courses with no required practice derive the full score from lesson completion and start at zero rather than receiving an artificial practice contribution.

## Database state

Latest tracked schema migration: `026_storyboard_audio_storage.sql`.

Repository state is not proof that a deployed Neon database has applied migrations. Apply outstanding migrations in the target environment with:

```bash
pnpm db:migrate
```

Storyboard legacy database audio migration is a separate data operation and runs only after migration 026:

```bash
pnpm storyboards:migrate-audio
```

Do not delete old applied SQL migrations; they are historical database state.

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

Provider activation:

- Resend: `RESEND_API_KEY`, `EMAIL_FROM`, plus `OXSIG_APP_URL`
- Ably: `ABLY_API_KEY`
- Sentry: `SENTRY_DSN`, `NEXT_PUBLIC_SENTRY_DSN`; optional source maps use `SENTRY_ORG`, `SENTRY_PROJECT`, `SENTRY_AUTH_TOKEN`
- PostHog: `POSTHOG_PROJECT_TOKEN`, `POSTHOG_HOST`
- OpenAI: `OPENAI_API_KEY`, optional `OXSIG_AI_MODEL`

Optional providers disable or degrade only their own capability when unconfigured; they must not crash the whole application.

## Local startup

Canonical local workflow:

```bash
git switch main
git pull --ff-only origin main
pnpm dev:up
```

`pnpm dev:up` preserves `.env.local`, performs frozen-lockfile installation when appropriate, runs database migrations, validates the configured local AWS identity/profile/account, and starts development. `pnpm dev` alone does not apply migrations.

## Remaining production gates after final hardening merges

These are environment/operator/live-validation tasks rather than unfinished feature architecture:

- Configure production Vercel environment values without committing secrets.
- Apply all outstanding Neon migrations through 026.
- Run `pnpm storyboards:migrate-audio` when legacy BYTEA recordings exist.
- Configure and verify production AWS IAM/OIDC identity, least-privilege permissions, S3, EC2, SSM, subnet, security group, and instance profile.
- Activate and live-test Clerk webhook, OpenAI, Resend, Ably, Sentry, and PostHog as required.
- Run `pnpm prod:check` and `pnpm readiness -- --strict` against production configuration.
- Live-test Clerk -> Academy -> lab provisioning -> Vercel terminal -> SSM -> cleanup.
- Live-test Storyboard S3 upload/playback and legacy-audio migration results.
- Live-test collaboration invitations, realtime/fallback behavior, and attachments.
- Exercise terminal recovery under a forced/unexpected WebSocket interruption and confirm the fresh-shell reset message is accurate.
- Enable/verify a `main` branch protection/ruleset requiring CI. The current GitHub app connection cannot independently read the administrative branch-protection endpoint.
- Perform final production smoke/E2E validation and assign the release score only from the resulting canonical `main` plus live evidence.

## Final audit rule

Separate code verification from live configuration verification. A committed integration is not proof that an external provider is configured, a database migration is applied, a cloud permission is correct, or a production E2E path works.

Target final audit flow: canonical main and CI; auth/security boundaries; database/migrations; Clerk; Academy/AI Practitioner; AWS labs and SSM terminal; S3/Storyboard/Vault/collaboration media; Resend/Ably/Sentry/PostHog/OpenAI; scheduler/cleanup; dependency reproducibility; production health/readiness; live E2E; documentation; final release score out of 100.
