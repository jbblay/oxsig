# OXSIG

OXSIG is a learning, collaboration, and practical cloud-lab workspace built around durable Academy progress, AI-assisted teaching, visual Storyboards, shared resources, and temporary AWS lab machines.

## Production architecture

- **Vercel** — Next.js application and production WebSocket terminal bridge
- **Clerk** — user identity, sessions, and user-sync webhooks
- **Neon** — PostgreSQL application state, Academy history/mastery, collaboration state, lab topology, rate limits, and terminal replay protection
- **AWS S3** — private workspace files, collaboration media, and Storyboard audio
- **AWS EC2 + Systems Manager** — temporary lab machines and browser terminal sessions without inbound SSH
- **OpenAI** — Academy and AI Practitioner teaching features
- **Resend** — transactional collaboration invitations
- **Ably** — realtime collaboration, with polling fallback when unconfigured
- **Sentry** — server/browser/terminal observability
- **PostHog** — allow-listed server-side product analytics

## Product surface

- Academy courses with durable progress, Q&A, practice evidence, sessions, mastery, and history
- AI Practitioner teaching flow integrated with visible lab-terminal execution
- AWS Cyber Lab with durable topology and temporary EC2/SSM machines
- Browser terminal through the same-origin `/__oxsig/terminal-bridge` boundary
- Storyboards with private S3 audio recording, signed playback, replay, and sharing
- Vault/private cloud storage
- Collaboration invitations, attachments, and realtime updates
- Scheduled lab cleanup and production readiness diagnostics

Desktop access is intentionally not advertised in the production lab catalog until a genuine browser desktop transport is implemented. Terminal access remains the supported production lab transport.

## Local development

The recommended canonical workflow is:

```bash
git switch main
git pull --ff-only origin main
pnpm dev:up
```

`pnpm dev:up` preserves an existing `.env.local`, installs from the frozen lockfile when needed, applies database migrations, validates the configured local AWS identity/profile, and starts development.

For manual operation:

```bash
pnpm install --frozen-lockfile
pnpm db:migrate
pnpm dev
```

`pnpm dev` alone does not apply migrations.

## Production configuration

`.env.example` is the authoritative variable contract. Never commit real credentials. Production uses the same application variable names in Vercel, while local-only `AWS_PROFILE` must be replaced by a production IAM/OIDC identity.

Before release, run:

```bash
pnpm prod:check
pnpm readiness -- --strict
```

`prod:check` validates the configuration contract. `readiness` additionally performs live checks where supported, including PostgreSQL, S3, EC2 lab networking, and terminal replay-protection state.

## Database and Storyboard migration

Apply committed schema migrations with:

```bash
pnpm db:migrate
```

The latest tracked schema migration is `026_storyboard_audio_storage.sql`.

After migration 026 is applied to a production database, migrate any legacy Storyboard BYTEA audio into S3 with:

```bash
pnpm storyboards:migrate-audio
```

Do not delete historical SQL migrations after they have been applied.

## Release rule

`main` is the canonical application only after a production PR has passed exact-head CI and been merged. A merged integration is not proof that external credentials, cloud resources, database migrations, or live end-to-end paths are configured; those must be verified separately in the target production environment.
