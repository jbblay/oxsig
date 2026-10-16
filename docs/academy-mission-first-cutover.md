# Academy cutover — missions replace legacy lesson journeys

## User-facing experience

OXSIG Academy now opens with a mission-first home page. Primary entry points are:
- Engineering World (connected technical assignments)
- Docker Mission Control (real-lab deployment, repair and persistence)
- Skills Passport / Mentor Forge (verified achievements and reviewed teaching)
- Mentor directory, sessions and controlled Rescue Rooms

The former lesson player and Learning Paths chooser are no longer displayed. URLs are preserved as navigational redirects:
- `/academy/paths` → `/academy/engineering-world`
- `/academy/prove` → `/academy/missions`
- `/academy/explore` → `/academy/engineering-world`

Navigation, global command search, guest Academy preview, mentorship center and operations briefing no longer promote the retired lesson journeys. No database tables, migrations, proof or transcript entries are dropped.

## Historical evidence and data protection

The existing `/academy/transcript` and `/api/learning/transcript` continue reading durable historical capability proof. Old capability records may still qualify mentors for their previously approved specialties; they are not deleted or automatically converted into new mission proof.

The older persistence/provider and curated-path read APIs remain available as compatibility infrastructure for existing data and account export. They are not an active entry point or recommended new enrollment workflow. A separate migration/deprecation review should remove obsolete API mutations only after downstream consumers and export needs are audited.

## Mission-based mentor eligibility

Docker-track Academy applicants may qualify to **apply** using five distinct, server-observed results:
1. The three individually verified Docker missions: `deploy`, `repair`, `persist` from `academy_mission_progress`.
2. Two verified **practice-mode** Engineering World runs: `docker-incident` and `docker-durability` from `academy_mission_runs`, version 1.

Incomplete or expired runs, group Troublefest runs, self-reported completions, XP, subscriptions and AI feedback never count. Separate mentor review, teaching evidence, moderation and admin qualification gates remain enforced. This new path currently covers Docker only. Other specialties require already documented validated evidence or separate professional review; do not imply unrelated missions certify Windows, Linux, networking or AWS capabilities.

## Verification checklist

- Run `pnpm typecheck`, `pnpm test:run`, `pnpm build` and database parity in AWS CodeBuild.
- Run `academy-mission-first.spec.mjs` at desktop and mobile viewports, plus the existing mentorship and simulated-commerce E2E suites.
- Verify existing mission acceptance checks and learner-owned SSM lab checks; don't claim live labs tested until an actual EC2/SSM session is available.
- Confirm no legacy navigation to lessons or paths is visible, and each old direct URL safely redirects.
- Confirm the historical transcript and account export still contain previous proof.
- Confirm mission-track eligibility requires every server-verified Docker check; repeat/forged/team-only completions cannot grant eligibility.
- Confirm the feature does not activate real money, automatic mentor approval or unattended terminal control.

## Rollout

Prepare a reviewed PR; do not delete learner evidence or alter existing migration checksums. Merging into `main` automatically triggers the Vercel production deployment; perform CI and review first.
