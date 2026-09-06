# OXSIG Production Handoff

Last updated: 2026-09-06

This file exists so a fresh ChatGPT/session or maintainer can resume OXSIG from repository truth rather than conversation history.

## Canonical repository and branch rule

Repository: `jbblay/oxsig`

`main` is always the canonical OXSIG application after a feature/production PR is merged. Do not audit stale historical branches as the current product.

PR #59, `Productionize terminal WebSocket transport for Vercel`, passed exact-head CI and was merged into `main` as `f634fb5fe526440486c16f527e3871b1ad7fe92f`.

PR #60, `Final runtime hardening before production configuration`, passed exact-head CI and was merged into `main` as `c2d24b2dc6fcc96a5185cf1f3cce64ddb353105b`. PR #61 then recorded that handoff in canonical main.

PR #88, `Live Workspace Foundation v1`, passed exact-head CI at `cc8735eadd018b98f0906fa6cb0d37e1485c7728` and was merged into canonical `main` as `91433a0ffbd99e244b61d01d52fc923650cd672a`.

The current production implementation extends that baseline with the genuine browser-desktop path and Live Workspace foundation described below. Always verify the current `main` head and exact-head CI before treating any SHA named in historical notes as canonical.

## Terminal transport state

Production uses a Vercel-native App Router WebSocket endpoint at `src/app/__oxsig/terminal-bridge/route.ts` via `experimental_upgradeWebSocket` from `@vercel/functions`. The existing custom `server.mjs` WebSocket bridge remains for local/custom Node deployments.

The Vercel route performs encrypted terminal-ticket verification, PostgreSQL one-time ticket consumption, same-origin checks, AWS SSM stream URL validation, SigV4 upstream authentication, buffering limits, handshake timeout, keepalive, and Sentry error capture. AWS credentials and the SSM StreamUrl remain server-side.

The terminal client performs bounded automatic recovery after an unexpected transport interruption. Recovery deliberately obtains a fresh SSM session/ticket rather than replaying a consumed bridge ticket. A fresh SSM shell can reset shell-local state such as the current working directory and exported variables; the UI states this explicitly. Manual disconnect does not trigger automatic recovery.

A live deployed Vercel/AWS test remains required because CI cannot prove behavior across real Vercel Function recycling or AWS SSM data channels.

## Browser desktop transport

Desktop access is a real application path for lab definitions that advertise a desktop profile. The current catalog exposes desktop mode for Windows Server and for Kali once its AWS Marketplace image is activated; other lab definitions remain terminal-only unless they gain an explicit reviewed desktop profile.

The desktop path reuses OXSIG's existing authenticated AWS/SSM boundary:

1. A user provisions a lab with `accessMode=desktop`; the server records that mode and selects the desktop-sized EC2 profile.
2. `POST /api/labs/instances/[id]/desktop/session` verifies authentication, CSRF, lab ownership, lease validity, EC2 state, and SSM Online state.
3. OXSIG prepares a loopback-only VNC service on the owned VM through SSM Run Command when the desktop service is not already ready.
4. The server starts the AWS-managed `AWS-StartPortForwardingSession` document to the VM's loopback VNC port.
5. The returned SSM StreamUrl and token remain behind the same encrypted one-time `/__oxsig/terminal-bridge` ticket boundary used by terminal sessions.
6. The browser uses OXSIG's Session Manager binary channel and built-in RFB client to render pixels and carry keyboard/pointer events.

Linux desktop uses TigerVNC with `-localhost`; Windows uses TightVNC configured loopback-only. VNC authentication is intentionally disabled inside that private loopback tunnel because user/application authorization, one-time ticket replay protection, and AWS Session Manager provide the access boundary. Do not open inbound VNC or RDP ports in the lab security group for this feature.

OXSIG's browser SSM client currently identifies as version `1.0.0`. This is deliberate for the desktop port tunnel: current amazon-ssm-agent selects its basic byte-stream port forwarding path for client versions below `1.1.70`; newer client versions trigger the native plugin's smux transport. A protocol test locks this compatibility assumption. Do not increase the browser SSM ClientVersion without reviewing both terminal and desktop transports.

Desktop transport also performs bounded recovery with a fresh SSM session after unexpected tunnel interruption. A live deployed Windows/Kali desktop test is still required as part of production validation; CI proves the application contract, type safety, tests, build, and database migration compatibility, not the external AWS/VNC runtime.

## Lab UI consistency

The Lab Inspector and Lab Dock are the single lifecycle surface for terminal and desktop profiles. Provision/start/open access actions use the primary action treatment, reversible lifecycle/diagnostic actions use the outline treatment, and permanent VM destruction uses the destructive treatment. Lifecycle controls share the same full-width height and alignment. Do not introduce a second unrelated desktop management screen unless the product architecture intentionally changes.

## Production work already implemented

The codebase contains the major production architecture: Clerk auth, Neon persistence, Academy durable courses/progress/Q&A/practice/sessions/mastery/history, Adaptive Instructor and failure/remediation learning flows, AI Practitioner integration, collaboration invitations and Ably realtime fallback, Live Workspace role/resource foundations, Sentry observability, PostHog analytics foundation, shared PostgreSQL rate limiting, scheduled lab cleanup, durable lab topology, private S3 storage, Storyboard direct-to-S3 audio and legacy migration, AWS EC2/SSM lab runtime, same-origin terminal and desktop bridging, session-ticket replay protection, reproducible pnpm lockfile CI, production configuration checks, database schema-parity verification, and readiness diagnostics.

Academy mastery scoring is defined so courses with required practice use a 70/30 lesson/practice weighting, while courses with no required practice derive the full score from lesson completion and start at zero rather than receiving an artificial practice contribution.

## Database state

At canonical `main` `91433a0ffbd99e244b61d01d52fc923650cd672a`, the latest tracked schema migration is `036_live_workspace_foundation.sql`.

Do not use the migration number written in this document as a release gate. Repository state is not proof that a deployed Neon database has applied the migrations required by the current checkout. Apply outstanding migrations in the target environment with:

```bash
pnpm db:migrate
```

Then require repository/database parity with:

```bash
pnpm db:parity
```

`pnpm db:parity` derives the numbered migration set from `migrations/`, compares it with `oxisg_schema_migrations`, and fails when repository migrations are pending or when the database contains migration history absent from the checkout. `pnpm readiness -- --strict` also treats schema mismatch as a critical failure.

CI starts a real PostgreSQL service, applies the complete migration chain, and requires `pnpm db:parity` before typecheck, tests, and the production build. This proves migration compatibility from an empty CI database; it does not prove that a specific deployed Neon database has been migrated.

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

No additional secret is required for browser desktop. The production AWS application identity does need `ssm:StartSession` access to the AWS-managed `AWS-StartPortForwardingSession` document in addition to the existing EC2/SSM lab permissions.

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

## Remaining production gates

These are environment/operator/live-validation tasks rather than unfinished feature architecture:

- Configure production Vercel environment values without committing secrets.
- Apply all outstanding Neon migrations with `pnpm db:migrate`, then require `pnpm db:parity` to pass against the production database.
- Run `pnpm storyboards:migrate-audio` when legacy BYTEA recordings exist.
- Configure and verify production AWS IAM/OIDC identity, least-privilege permissions, S3, EC2, SSM, subnet, security group, instance profile, and `AWS-StartPortForwardingSession` permission.
- Activate/verify the Kali Marketplace image if Kali desktop is intended to be publicly available at launch.
- Activate and live-test Clerk webhook, OpenAI, Resend, Ably, Sentry, and PostHog as required.
- Run `pnpm prod:check` and `pnpm readiness -- --strict` against production configuration.
- Live-test Clerk -> Academy -> lab provisioning -> Vercel terminal -> SSM -> cleanup.
- Live-test a Windows desktop profile end-to-end: provision -> desktop bootstrap -> SSM port session -> browser RFB -> keyboard/pointer -> disconnect/reconnect -> stop/destroy.
- Live-test Kali desktop after Marketplace activation if it is enabled for release.
- Live-test Storyboard S3 upload/playback and legacy-audio migration results.
- Live-test collaboration invitations, realtime/fallback behavior, attachments, and the Live Workspace foundation.
- Exercise terminal and desktop recovery under forced/unexpected WebSocket interruption.
- Enable/verify a `main` branch protection/ruleset requiring CI and blocking direct pushes. As of the 2026-09-06 audit, GitHub reported `main` as unprotected.
- Perform final production smoke/E2E validation and assign the release score only from canonical `main` plus live evidence.

## Final audit rule

Separate code verification from live configuration verification. A committed integration is not proof that an external provider is configured, a database migration is applied, a cloud permission is correct, or a production E2E path works.

Target final audit flow: canonical main and CI; auth/security boundaries; database/migrations and schema parity; Clerk; Academy/AI Practitioner; AWS labs and SSM terminal/desktop; S3/Storyboard/Vault/collaboration media; Resend/Ably/Sentry/PostHog/OpenAI; scheduler/cleanup; dependency reproducibility; production health/readiness; live E2E; documentation; final release score out of 100.
