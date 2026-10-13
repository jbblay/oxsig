# OXSIG AWS-first migration

Status at the time of writing (2026-10-13). Each capability is marked with how far it has progressed:

- **Implemented**: code exists.
- **Tested**: automated tests pass.
- **Deployed**: running in an AWS account.
- **Operational**: serving production traffic.

Nothing in this document has been **deployed** yet: there were no AWS, Vercel, Neon or billing credentials in the engineering session. See [Blockers](#blockers).

## 1. Dependency inventory (verified from source)

| Capability | Current provider | Integration points | Abstraction today | Runtime constraints |
|---|---|---|---|---|
| Hosting / SSR / API | Vercel (main-only deploys) | `vercel.json`, `@vercel/functions` (`experimental_upgradeWebSocket` in `src/app/%5F_oxsig/terminal-bridge/route.ts`), `VERCEL_ENV` guards | None. A custom `server.mjs` already exists for non-Vercel hosts | The terminal/desktop bridge is a long-lived WebSocket proxy to SSM |
| Scheduled jobs | Vercel Cron `17 2 * * *` → `/api/internal/labs/cleanup` | Bearer `CRON_SECRET` | Plain HTTPS endpoint | Idempotent; guarded by a Postgres advisory lock |
| PostgreSQL | Neon | `src/lib/db/pool.ts` (`pg.Pool`, max 10), `server.mjs` (max 2), `scripts/migrate.mjs` | Single pool module. Uses no Neon-specific features | Advisory locks, JSONB, `ON CONFLICT` |
| Identity | Clerk | `src/middleware.ts`, `src/lib/auth/*` (≈100 routes go through `requireAuth`), Svix webhook | `lib/auth/middleware.ts` wrapper | Session JWT `azp` must match the public origin |
| Transactional email | Resend | 4 call sites (collaboration and storyboard invitations) | **New:** `lib/email/server.ts` with Resend and SES adapters | — |
| Generative AI | OpenAI Responses API | `lib/ai/providers/*`, used by the AI Practitioner and lab AI routes | `StructuredAiProvider` interface. **New:** Bedrock adapter and fallback chain | Strict JSON-schema output; results are re-validated with zod |
| Voice (TTS/STT) | ElevenLabs today; AWS Polly TTS optionally prepared on this branch | `lib/voice/*`, `/api/voice/{tts,stt}` | Selectable TTS provider with optional fallback; STT remains ElevenLabs | Polly synchronous TTS supports up to 3,000 billed characters/request; long voice narration requires ElevenLabs fallback or future chunking |
| Realtime | Ably (REST token auth, browser SDK) | ≈19 server modules and 3 client hooks | `lib/realtime/ably.ts` plus channel-name module | Works on any host |
| Error tracking | Sentry | `instrumentation*.ts`, `server.mjs` | — | — |
| Product analytics | PostHog (server-side only) | 7 call sites | `lib/analytics/posthog.ts` | — |
| Object storage | **AWS S3** (already) | `lib/storage/*`, presigned POST/GET | Module | Per-user key prefixes |
| Cyber Labs compute | **AWS EC2 + SSM** (already) | `lib/labs/*`, `lib/operations/*`, terminal bridge | Module | Probably the largest AWS spend |
| AWS credentials | Vercel OIDC → `AWS_ROLE_ARN` | `lib/aws/client-config.ts`, `scripts/aws-client-config.mjs` | Falls back to the default chain when `AWS_ROLE_ARN` is unset | On ECS, leave `AWS_ROLE_ARN` unset and use the task role |
| CI | **AWS CodeBuild** `oxsig-ci` (already, us-east-1) | `buildspec.yml` | — | — |

Current monthly cost per provider is **not visible from the repository**. It needs the Vercel, Neon, Clerk, Resend, OpenAI, ElevenLabs, Ably, Sentry and PostHog billing consoles; see Blockers.

## 2. Credit eligibility

**Sources.**
- [AWS Activate Credits](https://aws.amazon.com/startups/credits). The Activate Founders package is a one-time [$1,000 grant](https://aws.amazon.com/startups/learn/applying-for-aws-activate-credits-a-step-by-step-guide?lang=id), historically valid for two years ([launch notice](https://aws.amazon.com/ru/about-aws/whats-new/2020/02/aws-launches-activate-founders-package)).
- Activate credits [apply to third-party models on Amazon Bedrock](https://aws.amazon.com/startups/learn/aws-activate-credits-now-accepted-for-third-party-models-on-amazon-bedrock), including Anthropic, Meta and Mistral, as well as Amazon models.
- The [AWS Promotional Credit Terms](https://aws.amazon.com/awscredits/) exclude certain charges. For example, credits do not cover [Route 53 domain registration](https://repost.aws/questions/QUusx8hHSISnqFU__-s85h7Q/buy-domains-with-startup-credits) or [upfront Reserved Instance / Savings Plan fees](https://aws.amazon.com/premiumsupport/knowledge-center/credits-ri/). Separately, [some credits only apply to specific services](https://aws.amazon.com/premiumsupport/knowledge-center/aws-promotional-credit/).

*Content was rephrased for compliance with licensing restrictions.*

**This account's actual credits were not verified.** Before relying on the credits, the account owner must check these two things in the Billing console (**Credits** page):
1. The remaining balance and the expiry date.
2. The **"Applicable products"** list for the credit code.

Equivalent CLI command (requires billing permissions):

```bash
aws ce get-cost-and-usage --time-period Start=2026-09-01,End=2026-10-01 --granularity MONTHLY \
  --metrics UnblendedCost --group-by Type=DIMENSION,Key=RECORD_TYPE
```

| Proposed AWS service | Generally credit-eligible? | Notes |
|---|---|---|
| ECS Fargate, ALB, ECR, RDS, Secrets Manager, CloudWatch, SNS, EventBridge, SES, S3, EC2/SSM | Yes (standard usage-based services) | Confirm against the credit's applicable-products list |
| Bedrock, Amazon models | Yes | — |
| Bedrock, third-party models (e.g. Anthropic) | Yes for Activate credits (per the AWS sources above) | Some third-party models are billed through AWS Marketplace; confirm the specific model in the console |
| Route 53 domain registration, Savings Plan/RI upfront fees, Support plans | No | Not used by this design |

## 3. Replacement matrix and decisions

| Capability | AWS option evaluated | Decision | Why |
|---|---|---|---|
| Generative AI | **Bedrock (Converse + forced tool use)** | **Replace, incrementally.** Use `OXSIG_AI_PROVIDER=bedrock` with `OXSIG_AI_FALLBACK_PROVIDER=openai` | Usage-based, so the credits translate directly into savings. Uses the existing provider interface. Outputs are still zod-validated. Rollback is one environment variable. |
| Transactional email | **SES v2** | **Replace after domain verification.** Set `OXSIG_EMAIL_PROVIDER=ses` | About $0.10 per 1,000 emails. Same result contract. Needs DKIM DNS records and SES production access, which is out of the sandbox. |
| Hosting | **ECS Fargate (ARM64) + ALB** | **Prepare now. Cut over last, after a cost decision.** | `server.mjs` already runs the WebSocket bridge natively. App Runner is closed to new customers ([notice](https://docs.aws.amazon.com/apprunner/latest/relnotes/welcome.html)) and has no WebSocket support. Lambda is unsuitable for hour-long terminal sessions. |
| PostgreSQL | **RDS for PostgreSQL** (gp3, encrypted, PITR) | **Prepare now. Cut over with hosting.** | No Neon-specific features are in use. Aurora Serverless v2 costs more at this scale. RDS keeps `pg_dump`/`pg_restore` simple. |
| Scheduled cleanup | **EventBridge rule → API destination** (Bearer `CRON_SECRET`) | **Replace at hosting cutover** | Same endpoint, auth and lock; no code change. |
| Observability | CloudWatch Logs + alarms (5xx, unhealthy targets, p95 latency, RDS CPU/storage/connections) | **Add. Keep Sentry.** | Sentry gives stack traces and source maps; CloudWatch gives infrastructure signals. They complement each other. |
| Identity | Cognito | **Retain Clerk** | Migrating would break ~100 routes and the session model. Passwords can't be re-hashed into Cognito without a migration Lambda or forced resets. Credit value is low. |
| Realtime | AppSync Events / API Gateway WebSocket | **Retain Ably for now** | It is host-independent and touches about 22 files. Move only if the Ably bill justifies it. |
| Voice | Polly / Transcribe | **Enable Polly TTS as an optional AWS provider; retain ElevenLabs for STT and as an optional TTS fallback.** | Polly can replace paid TTS calls after a real audio quality/integration test. The existing voice recording upload remains ElevenLabs-only; Amazon Transcribe integration still requires implementation. |
| Analytics | — | **Retain PostHog** | There is no equivalent AWS product analytics service. |
| Storage, labs, CI | Already AWS | Retain | Move the lab IAM permissions from the Vercel OIDC role to the ECS task role (`LabRuntimePolicyArn`). |

## 4. Estimated AWS monthly cost (eu-central-1, on-demand, before credits)

These are estimates from public list prices and need checking in the AWS Pricing Calculator. Frankfurt prices are roughly 10–20% above us-east-1.

| Item | Staging (1 task, single-AZ DB) | Production (2 tasks, Multi-AZ DB) |
|---|---|---|
| Fargate ARM 0.5 vCPU / 1 GB, 24×7 | ≈ $15–18 | ≈ $30–36 |
| ALB (base + low LCU) | ≈ $20–25 | ≈ $22–30 |
| RDS PostgreSQL db.t4g.micro (+20 GB gp3) | ≈ $15–19 | ≈ $30–38 (Multi-AZ) |
| Public IPv4 ($0.005/h each: ALB nodes + tasks) | ≈ $11–15 | ≈ $15–20 |
| Secrets Manager, CloudWatch Logs, ECR, SNS, EventBridge | ≈ $3–8 | ≈ $5–12 |
| SES | < $1 | < $1–2 |
| Bedrock | Usage-based: tokens × the model's price. Measure from the `oxsig.ai.request` log lines during shadow traffic. | — |
| **Fixed subtotal** | **≈ $65–85 / month** | **≈ $105–140 / month** |

The template's design choices keep these costs down:
- No NAT gateway, which saves about $35+/month.
- No Container Insights and no WAF by default.
- Graviton tasks.
- `DesiredCount: 0` until the stack is ready.
- A gross-cost budget (credits excluded) that alerts at 50% and 80% of actual spend and at 100% of forecast.

**FinOps conclusion.**
- **What the credits cover:** $1,000 of Founders credits pays for roughly 7–12 months of staging, or 6–9 months of production fixed cost, plus Bedrock usage. Existing lab EC2/S3 usage draws on the same credits.
- **After the credits run out:** AWS hosting plus RDS is likely to cost more than the current Vercel and Neon plans, unless those plans are already above about $100/month. That cannot be verified without their bills.
- **Highest-value use of credits:** Bedrock (it replaces OpenAI spend one-for-one), SES, and the lab compute that already runs on AWS.

## 5. Target architecture

```text
            Clerk (identity, retained)        Ably (realtime, retained)
                     │                               ▲
 Browser ── HTTPS ──► ALB (TLS 1.3, idle 3600s) ──► ECS Fargate ARM64  (server.mjs: Next.js + WS terminal bridge)
                                                     │  task role (no static keys)
          ┌──────────────┬─────────────┬─────────────┼──────────────┬────────────────┬──────────────┐
          ▼              ▼             ▼             ▼              ▼                ▼              ▼
     RDS PostgreSQL   Secrets Mgr   Bedrock        SES v2        S3 uploads     EC2/SSM labs   CloudWatch Logs
     (private, PITR)  (app secret)  (Converse)     (DKIM)        (existing)     (existing)     + alarms → SNS
                                                                                                  ▲
                         EventBridge rule (02:17 UTC) ── API destination (Bearer CRON_SECRET) ────┘ /api/internal/labs/cleanup
```

The stack is defined in [`infra/aws/template.mjs`](../infra/aws/template.mjs), which generates `infra/aws/oxsig-platform.template.json`. Its invariants are checked by `scripts/tests/aws-infra-template.mjs`: references resolve, the DB is private and encrypted, secrets come only from Secrets Manager, the WebSocket idle timeout is set, credits are excluded from the budget, and the stack can be created at zero tasks.

## 6. Migration sequence (incremental, with rollback at every step)

Every step is reversible by an environment-variable or DNS change. None of them disconnects Vercel, Neon, Clerk, Resend or OpenAI.

| # | Step | Cutover | Rollback | Exit criteria |
|---|---|---|---|---|
| 0 | Merge #219 (platform remediation) and run `pnpm db:migrate` on Neon (applies 058) | — | 058 is additive. Code works with or without it | CodeBuild green; `pnpm db:parity` passes on Neon |
| 1 | Verify the account's credits and enable the Bedrock model; create a budget | — | — | Credit balance and applicable products confirmed |
| 2 | **AI**: on Vercel, set `OXSIG_BEDROCK_MODEL_ID`, `OXSIG_BEDROCK_REGION` (explicitly: Vercel sets `AWS_REGION` to the function region), `OXSIG_AI_PROVIDER=bedrock`, `OXSIG_AI_FALLBACK_PROVIDER=openai`, and grant `bedrock:InvokeModel` to the Vercel OIDC role | Env var | `OXSIG_AI_PROVIDER=openai` | Fallback rate and latency from `oxsig.ai.request` logs within target; AI Practitioner flows pass manual QA |
| 2a | **Voice playback**: grant `polly:SynthesizeSpeech` to the current runtime role and set `OXSIG_VOICE_TTS_PROVIDER=polly` with `OXSIG_POLLY_REGION=eu-central-1`, `OXSIG_POLLY_VOICE_ID=Joanna`, `OXSIG_POLLY_ENGINE=neural`. Leave `OXSIG_VOICE_TTS_FALLBACK_PROVIDER=elevenlabs` only if the ElevenLabs balance makes that fallback usable. | Env var | `OXSIG_VOICE_TTS_PROVIDER=elevenlabs` | Authorized user hears MP3 from Polly and the UI can handle failure; test text below and above 3,000 characters. Speech-to-text is NOT migrated. |
| 3 | **Email**: verify the SES domain (DKIM CNAMEs from the stack output) and request production access. Then set `SES_REGION`, `OXSIG_EMAIL_PROVIDER=ses` and grant `ses:SendEmail` | Env var | `OXSIG_EMAIL_PROVIDER=resend` | Invitation emails delivered; `collaboration_invitations.provider='ses'` with message ids |
| 4 | Deploy the stack (`staging`, `DesiredCount=0`), push the image, populate the app secret, scale to 1 | — | Delete the stack (the DB is snapshotted on delete) | `/api/health` 200 through the ALB; terminal bridge works through the ALB |
| 5 | **Data rehearsal**: `pg_dump` Neon → `pg_restore` RDS, then `scripts/aws/db-compare.mjs` and `pnpm db:parity` against RDS | — | Drop the RDS DB | db-compare `ok: true` on every table |
| 6 | **Staging soak**: point a staging hostname at the ALB (Clerk allowed origins + webhook endpoint for staging) and run the e2e suite against it | Staging DNS only | Remove the record | E2E green; alarms quiet for 72h |
| 7 | **Production cutover** in a maintenance window. In order: (1) put Neon read-only (revoke writes on the app role); (2) take the final `pg_dump` and restore it; (3) run db-compare; (4) switch `DATABASE_URL` to RDS on ECS; (5) switch public DNS to the ALB; (6) disable the Vercel cron and enable `EnableCleanupSchedule` | DNS (low TTL set 48h before) | DNS back to Vercel; Neon writable again (no writes were lost because it was read-only during the window) | Error and latency SLOs hold for 7 days |
| 8 | Decommission: keep Neon and Vercel for 30 days, then remove them | — | — | Final Neon backup archived to S3 |

**Database copy runbook (step 5 and step 7).** Use Neon's direct, non-pooled endpoint. Use PostgreSQL 18 client tools, matching the live Neon PostgreSQL 18 server major version.

```bash
pg_dump --format=custom --no-owner --no-acl "$NEON_DIRECT_URL" -f oxsig.dump
pg_restore --no-owner --no-acl --exit-on-error -d "$RDS_URL" oxsig.dump
SOURCE_DATABASE_URL="$NEON_DIRECT_URL" TARGET_DATABASE_URL="$RDS_URL" node scripts/aws/db-compare.mjs
DATABASE_URL="$RDS_URL" pnpm db:parity
```

- **Rehearsed locally against PostgreSQL 16.15 only:** dump → restore → `db-compare` reported `ok: true` across 53 tables. After a row was deleted and another edited on the target, `db-compare` reported both differences and exited 1.
- **For near-zero downtime:** consider Neon logical replication into an RDS subscription instead of dump/restore, then run the same `db-compare` once lag reaches zero. Validate extension, publication, permission, and replication-lag compatibility before proposing it as a safe cutover.
- **PostgreSQL version:** the *live Neon production source is PostgreSQL 18.6*, not 16. The CloudFormation template now defaults to `DbEngineVersion=18.6` and `DbParameterFamily=postgres18`. Use PostgreSQL **18 client tools** for `pg_dump` and `pg_restore` when migrating, and verify the selected RDS engine version and extensions. PostgreSQL 16 clients cannot dump a PostgreSQL 18 server.
- **Rollback:** before opening RDS to writes, document the reverse replication or planned write-freeze needed to return to Neon without losing writes after cutover. DNS reversal alone is not a data-safe rollback after RDS has accepted writes.

## 7. Disaster recovery

| Component | Protection | Target |
|---|---|---|
| RDS | Automated backups (7d staging / 14d production) with PITR; snapshot on stack delete; deletion protection in production; Multi-AZ optional | RPO ≤ 5 min (PITR), RTO ≈ 30–60 min (restore to a new instance + secret update) |
| App | Immutable ECR tags; ECS deployment circuit breaker with automatic rollback; stateless tasks | RTO minutes (redeploy the previous task definition) |
| Secrets | Secrets Manager with `Retain` on delete | — |
| Cutover | Neon and Vercel stay intact and read-only for 30 days | DNS rollback in TTL time |

## Blockers

1. **No AWS credentials in the session.** So the following could not be verified: the credit balance and applicable products, Bedrock model access, SES sandbox status, and the existing lab IAM policy. No stack was deployed. Nothing was charged.
2. **No Vercel, Neon or SaaS billing access.** Current per-provider costs and the production data volume are unknown.
3. **DNS and Clerk dashboard changes** (allowed origins, webhook endpoint, SES DKIM) need the account owner.
4. **The container image has not been built.** The sandbox has no npm registry access, and CodeBuild runs without a Docker build step. The first image build should run in CodeBuild with privileged mode, or locally.

## Targeted voice functionality gap and readiness

The existing `/api/voice/tts` endpoint returned MP3 from ElevenLabs only, even if AWS credits were available. This branch adds an AWS Polly TTS adapter using the same signed AWS credential chain as the Bedrock adapter. **The default remains ElevenLabs**, so existing production traffic is unchanged until configured. The optional fallback is attempted only if the primary TTS provider fails.

Configuration: `OXSIG_VOICE_TTS_PROVIDER=polly`, `OXSIG_POLLY_REGION=eu-central-1`, `OXSIG_POLLY_VOICE_ID=Joanna`, `OXSIG_POLLY_ENGINE=neural`. Optionally choose `OXSIG_VOICE_TTS_FALLBACK_PROVIDER=elevenlabs`. ECS task permissions include `polly:SynthesizeSpeech`. If Vercel is used as the runtime during the staged cutover, its AWS OIDC IAM role also requires that permission before switching the environment variable.

**Honest status:** text-to-speech AWS support is implemented but not production-deployed or end-to-end verified. Amazon Polly synchronous synthesis accepts up to 3,000 billed characters; longer narration requires a separately configured fallback provider or a future long-form speech solution. The voice recording/transcription endpoint still relies on ElevenLabs and needs its own AWS migration. Ably realtime, Sentry and PostHog are not replaced by this voice change.
