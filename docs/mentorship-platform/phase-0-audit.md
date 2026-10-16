# OXSIG Learn · Build · Prove · Mentor · Earn — Phase 0 audit

Audited: `main` at `7d196e5` (2026-10-15), plus open PR #239 (`feat/academy-mission-control-docker`, head `060378f`).
Purpose: decide what each programme area reuses, what is missing, and what must not be duplicated. This document changes no code.

## 1. What exists today

### Academy and learning

| Area | State in `main` | Where |
| --- | --- | --- |
| Courses | AI-generated (`generateAcademyCourse`) or static curated paths; stored as JSONB in `academy_courses.course_data`. One active course per owner (unique index). | `src/lib/academy/server.ts`, `persistence.ts`, migration 022 |
| Curated paths | Static TS catalogs: `program-becomes-process` (8 capabilities), `active-directory-operations` (7). Enrollments and capability evidence in `learning_path_enrollments` / `learning_capability_evidence`. | `src/lib/learning/curated-*.ts`, migrations 039, 047 |
| Practice verification | Learner runs the command in their own lab terminal; the bridge writes `execution_evidence`; `/api/academy` evaluates **server-stored** stdout/exit code; DB triggers (047) write capability evidence. Client-supplied output is ignored. | `src/app/api/academy/route.ts`, `src/lib/execution-evidence` |
| Capability "demonstrated" | Assessment, **or** practice + reflection evidence for the same capability. | `curated-path-server.ts`, `/api/users/me/progress` |
| Mastery / independence | `academy_mastery`: lesson ratio + practice ratio; understanding (reflections) and independence (100 − assistance weight). | `persistence.ts`, `adaptive-instructor.ts` |
| XP / levels / badges | **Not stored.** Computed on read from aggregates (`buildLearningRewards`): capability 250, passed practice 75, lab started 100, active day 25. Level 8 is named "Mentor". | `src/lib/learning/rewards.ts` |
| Adaptive instructor | Deterministic mode policy (explain / guide / demonstrate / observe), progressive hint levels 1–3, assistance weights, strict JSON output, prompt rules forbid issuing or claiming to run commands. Every intervention is persisted. | `src/lib/academy/adaptive-instructor.ts`, migration 034 |
| Failure injection | Server executes a fixed, sandboxed fault template (`/tmp/oxsig-failure-labs/<uuid>`), verifies and cleans up. | `src/lib/academy/failure-injection.ts`, migration 035 |
| AI Practitioner | Separate planner/executor with command deny-list and read-only/changes-system classification. | `src/lib/ai-practitioner/server.ts` |

**PR #239 (open, CI green, not merged)** adds `/academy/missions`: three Docker missions (deploy → repair → persist), server-owned verification commands over SSM, explicit consent before fault seeding, notes, hint counting, and an AI mentor that reuses `answerAcademyQuestion`. Migration `060_academy_mission_control.sql` (`academy_mission_progress`).

### Labs, Live Workspace and collaboration

| Area | State in `main` |
| --- | --- |
| Cyber Labs | Single owner per `lab_instances` row; one non-terminal lab per owner; TTL 15–120 min (default 60); termination guard for untagged compute; reconcile route. |
| Terminal bridge | AES-GCM single-use tickets (30–60 s), replay table, origin check; shared sessions re-validate the control lease on every input frame and every 2 s. |
| Live Workspace | Rooms on `collaborations`; roles owner / instructor / learner / observer; resource bindings without ownership transfer; Board/Machine stage; room chat. |
| Control leases | 5–60 min, one active controller per surface (DB-enforced), approval cannot be self-granted, immediate revoke (holder or grantor), bulk revoke on role change / removal / room end. |
| Terminal observation | Ably channel scoped to one lease; publish only by holder; subscribe by any participant with `observe`. |
| Notifications | `createWorkspaceNotification` with dedupe key (`workspace_notifications`). |
| Media | Board-only streaming (BoardStream, TURN-gated). Room voice/video, screen sharing and desktop transport are **not implemented** (Screen button deliberately disabled). |

### Identity, admin and platform controls

- `requireAuth` / `requireAdmin` / `optionalAuth`; `AuthenticatedUser.role` is `'user' | 'admin'` (founders resolve to admin). Suspension is all-or-nothing (`users.suspended_at`).
- Admin console (`/admin`, tabbed, `withPlatformAdmin` guard: admin role, CSRF on mutations, fail-closed rate limit, audit trail via `logAudit`).
- Account export is an explicit allowlist (`EXPORT_SOURCES`); deletion relies on FK cascades (`ON DELETE` mandatory for FKs to `users`, enforced in CI).
- CI (AWS CodeBuild, reports `AWS CodeBuild / oxsig-ci` on PRs): server syntax, typecheck, source reachability (every `src` module must be imported from a route/page), persistence policy (no new web storage writers), env contract, Vitest + node tests, migration integrity (checksums, `REQUIRED_RUNTIME_RELATIONS`, no bare transactions), real-Postgres replay + rolled-back SQL scenarios (`db:verify`), production build.

## 2. Gaps and risks found

1. **No mentorship concept anywhere** — no mentor role, application, qualification, profile, booking or session model.
2. **Lesson completion is client-asserted** (`PATCH /api/academy/state` → 70 % of mastery score), and an active day (25 XP) is recorded on every Academy state read. XP is therefore *not* a trustworthy mentor signal. Mentor eligibility must use capability evidence, never XP or mastery score.
3. PR #239's `academy_mission_progress.mission_id` is a `CHECK IN ('deploy','repair','persist')` and mission verification does not feed `learning_capability_evidence` or rewards. A general mission engine (Phase 4) needs a catalog-driven mission table or must map mission verification into capability evidence; it should extend #239, not run beside it.
4. Live Workspace has **no room-level expiry**, no per-participant resource visibility (every participant sees every attached resource label), and no separate observation consent. Rescue Rooms (Phase 2) need: session end time enforced server-side, mentor scoped to the binding the learner explicitly shared, and observation opt-in.
5. Lease expiry is lazy (on read/approve) — acceptable because every privileged path re-checks, but a time-limited mentorship session must also be checked on every access, not by a background job.
6. Academy AI calls bypass the provider abstraction (`src/lib/ai/providers/server.ts`). New mentor AI features (Mentor Forge evaluation) should reuse the instructor/provider modules rather than add a third client.
7. Migration numbering: PR #239 claims `060`. New work uses `061+` so both can merge in either order.

## 3. Reuse map (what each programme area builds on)

| Programme area | Reuse | New |
| --- | --- | --- |
| Mission-based learning, Engineering World, Forked Futures | PR #239 mission engine, failure-injection templates, execution evidence, lab TTL | Catalog-driven missions, storyline state, decision records (Phase 4) |
| Adaptive AI mentor (Coach/Guide/Explain/Assess) | `adaptive-instructor.ts` modes + hint levels + assistance weight | Map Coach→observe/guide, Assess = no-hint mode; mission context input |
| Incident Flight Recorder | `execution_evidence`, `academy_instructor_interventions`, mission checks | Sanitised timeline view + learner-controlled share grant |
| Mentor foundation (Phase 1) | Auth, admin console, audit, notifications, capability evidence, export/deletion | Applications, profiles, qualifications, directory, review queue |
| Rescue Rooms, booking (Phase 2) | Live Workspace roles, resource bindings, control leases, terminal observation, chat, invitations | Sessions with start/end, help requests, availability, booking, room expiry, scoped visibility |
| Mentor Forge, Proof of Help, Skills Passport (Phase 3) | Instructor prompt/eval patterns, transcript (`loadProvedSkillTranscript`) | Simulated-learner scenarios, session outcomes separate from mission verification, revocable share links |
| Troublefest (Phase 4) | Live Workspace + leases + failure injection | Team roles, multi-learner verification |
| Credits, earnings, subscriptions (Phase 5) | — | Separate ledgers; provider sandbox only; no live money |

## 4. Non-negotiables carried into every phase

- Server-side enforcement for mentor, booking, lab and payment access; no automatic access to learner resources.
- Mentor approval requires evidence + administrator decision; XP and subscriptions never qualify anyone.
- XP, Learning Credits and Mentor Earnings stay in separate stores; nothing converts XP to money.
- Additive, forward-only migrations registered in `checksums.json` and `REQUIRED_RUNTIME_RELATIONS`; new user-owned tables join `EXPORT_SOURCES` and cascade on account deletion.
- Screen share, voice/video and desktop control are reported as unavailable until a transport is built and tested.
- No real payments, no merge to `main`, no production deploy from this programme without explicit authorisation.

## 5. Phase plan (one reviewable PR each)

| Phase | Scope | Status |
| --- | --- | --- |
| 0 | This audit | This PR |
| 1 | Mentor applications (Academy-grown and external), evidence-based eligibility, progression ladder, admin review, qualifications, profiles, directory, suspension | Next PR |
| 2 | Free mentorship: availability, booking with double-booking protection, mission help requests, time-limited Rescue Room on Live Workspace, session history | Planned |
| 3 | Mentor Forge, Proof of Help outcomes/disputes, Skills Passport share links, tier promotion inputs | Planned |
| 4 | Mission engine generalisation (on #239), Flight Recorder, Forked Futures, Troublefest | Planned |
| 5 | Payment-provider sandbox, subscriptions/entitlements config, learning-credit ledger, earnings ledger, reconciliation — all disabled for live money | Planned |
