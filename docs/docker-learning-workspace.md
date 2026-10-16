# Docker learning workspace

Academy → Docker now opens `/academy/learn/docker`. The existing Mission Control
component is the workspace foundation, using the same mission progress and live
server verification as `/academy/missions`. The visual simulator remains optional
at `/academy/learn/docker/simulator`; its simulation records are unchanged.

## Learner flow

1. Read the engineering assignment and short container introduction. Explain how
   containers differ from VMs. Save the explanation and request teaching feedback.
2. Start Ubuntu through the existing authenticated lab endpoint, or reuse a
   learner-owned Linux lab. Launch still enforces the original quota, cost rate
   limit, TTL, AWS configuration and lifecycle checks.
3. On Ubuntu, choose **Prepare Docker on this lab**. The server runs a fixed
   bounded preparation job using signed Ubuntu packages. No installation command
   is accepted from the browser. Compatible labs with Docker already ready skip
   preparation; other Linux profiles are checked but never automatically modified.
4. Use the existing interactive SSM terminal. Tool tabs keep the terminal mounted.
   Hints are progressive; direct teaching is available. AI advice never grants XP.
5. Run live verification. Observed checks explain the result; success unlocks
   repair, then persistent data. Repair retains explicit consent before replacing
   the reserved `oxsig-academy-web` container.
6. Return to the first unfinished mission. Account records survive lab expiry.
   Recreate practical files on a fresh machine; no snapshots or filesystem restore
   are introduced, and a Docker volume does not survive machine destruction.

Existing generated-course reflections require an active course and bound terminal
evidence. Those flows remain unchanged. The introductory concept uses the existing
Academy question service for formative feedback, stored alongside mission progress.
It is not a new scoring system, scored assessment, or practical certification.
AI outages leave the explanation saved and do not block practice.

## Deployment

- Apply migrations through **068_docker_workspace_concept.sql** using the existing
  migration runner before deploying the application. The migration only adds
  concept fields to `academy_mission_progress`; existing records remain intact.
- No new environment variables or AWS IAM actions are introduced. The existing
  `DATABASE_URL`, Clerk/CSRF configuration, `LAB_AWS_*` settings, SSM instance
  profile and managed terminal bridge must work. Refer to `docs/aws-migration.md`
  and `infra/aws/README.md` for the existing infrastructure setup.
- Preparation uses the existing `ssm:SendCommand` / command-invocation access and
  root SSM execution on Ubuntu. Guests need systemd, flock, repository egress and
  access to the approved Docker image registry. Validate custom Ubuntu AMIs before
  release. No inbound application or SSH port needs opening.
- The preparation service has a ten-minute runtime limit, a fixed systemd unit,
  package-manager lock waits and a guest lock. Failures are shown with retry/lab
  control actions. The workspace polls transitional status every 15 seconds only
  while visible, stops after ten minutes, and offers explicit refresh.
- Active Engineering World runs prevent attaching beginner practice or seeding a
  competing incident. Start/fork operations reject an existing active run on the
  same lab. Finish or abandon that run in Engineering World before retrying.
  Historical runs are retained. Learners still control their own terminal commands.

## Validation and release gates

Run `node --experimental-vm-modules scripts/tests/docker-workspace.mjs` for the
dependency-free server-boundary tests and `node scripts/tests/migrations-integrity.mjs`
for migration guards. The new browser scenario is `e2e/docker-workspace.spec.mjs`,
covering desktop/mobile entry, saved explanations, mission resume and AI failure.
Existing simulator tests use its optional route.

In the implementation environment, npm installation was blocked by an unreachable
network proxy. Type checking, Next build, Vitest and Playwright could not run because
their executables were unavailable. There is no repository lint script. Do not
release to learners until CI passes typecheck, build, unit and browser suites,
the migration is applied to staging, and an actual Ubuntu launch → Docker prepare →
SSM terminal → deploy/repair/persist verification → expiry/resume is exercised.
No live AWS, AI, database migration or infrastructure test is claimed here.

Preparation may fail when Ubuntu repositories or Docker Hub are unavailable; use
the retry and diagnostics flow. There is no file backup, machine restore, or new
persistent infrastructure service in this change. Notes require explicit saving.
