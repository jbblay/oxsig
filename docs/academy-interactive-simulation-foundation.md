# Interactive Academy foundation — Docker Kingdom

## Learner experience

Academy opens into four career areas: DevOps & Cloud, Cybersecurity, System Administration and Programming. Only **DevOps → Docker** is playable in this foundation; the other skills are explicitly labeled *Coming later*. There are no fake completed curricula.

Docker Kingdom is an activity-first, three-castle journey:
1. **Container Workshop:** choose an image and Academy-owned container name.
2. **Connect the Service:** configure published host/container port and simulated HTTP endpoint.
3. **Keep the Data:** mount a named volume at the web root and create the expected page marker.

The lesson opens with a visual workbench, not a wall of text. Users can drag configuration components into slots or use keyboard/mobile-friendly selectors. Server-owned grading marks each slot, lights the connection green on success and unlocks the next stage. Explanations are optional and contextual.

## Reusable software foundation

- `src/lib/academy/simulation-policy.ts`: versioned data describing stage order, tools, options, hints and inter-stage unlocks; future track modules can follow this contract.
- `src/components/academy/DockerSimulationWorkshop.tsx`: accessible interactive workbench and roadmap.
- `src/lib/academy/simulation-server.ts`: server-only canonical configuration verifier, owner-scoped PostgreSQL state, serialized state mutations and replay-safe SP.
- `src/app/api/academy/simulator`: authenticated, CSRF-protected, rate-limited, strictly parsed GET/POST; errors never reveal another learner's progress.
- `067_academy_simulation_progress.sql`: additive practice-state table; unique owner, skill, stage and version, deletion cascade, fixed nonredeemable SP and schema parity.
- Account export includes simulator progress. History and real Docker mission evidence are unchanged.

## Evidence separation

A server-checked browser simulation **is not** a Docker runtime. This foundation uses a constrained, deterministic configuration model. It does not start actual Linux containers, simulate Linux syscalls or verify packet-level STP; Docker correctness is represented by server-owned rules. A later network simulation engine would need protocol-accurate state and graph validation.

`academy_simulation_progress` cannot grant real mission verified state, Skills Passport technical proof, mentor eligibility, monetary credits or earnings. Learners receive **25 practice SP per completed simulated castle**, maximum 75 for version 1. SP cannot be transferred or redeemed, and duplicate requests cannot increase the score. The previous live mission system remains at `/academy/missions` with AWS SSM verification and separate credentials/evidence.

## Acceptance / release gates

1. AWS CodeBuild with `pnpm server:check`, `pnpm typecheck`, reachability audit, persistence and environment checks, unit tests, real PostgreSQL migration replay/checksum/parity, production Next.js build.
2. Chromium desktop and mobile tests: career selection, workbench selectors, direct locked-stage API bypass, partial incorrect inputs, server-pass check, persisted green state, three unlocks, SP idempotency, account-A/account-B isolation.
3. Validate rollback and account export/deletion cascade. No historical tables or records should be removed.
4. Manually verify drag-and-drop, keyboard and touch behavior and responsive layout.
5. Migrate 067 on a production *clone* before a release. Since main auto-deploys to Vercel, deploy only after an approved migration schedule and completed checks.
6. No actual lab/SSM test is claimed by browser simulation tests. Keep the existing independent lab acceptance plan.

## Expansion path

Build hardware slots for CPU/RAM/storage, network graph connectors and packet-level validators, command/terminal sandboxes with strict workload isolation, and then more career roadmaps. Reuse the stage contract, owner-scoped progress ledger, approval gates, checkpoint UI and accessibility conventions. Do not implement arbitrary client-executed Docker commands or expose the host Docker socket.
