# Phase 4: Engineering World and versioned mission runs

Stacked on Phase 3, without merging or deploying. Migration 065 adds owner-scoped mission runs and Flight Recorder events; all prior migration bytes remain unchanged.

## Behavior

- Engineering World at `/academy/engineering-world` organizes three real Docker mission templates into service delivery, incident response, and reliability districts. Each template has an immutable version, prerequisites, safe diagnostic choices, bounded provider operations and a server-observed completion check.
- Flight Recorder persists ordered diagnostic choices, consent, preparation, checks, expiry, abandonment and lineage. It never stores raw terminal output or credentials. The authenticated owner alone can read runs; account export includes the recorder and account deletion cascades it.
- Forked Futures starts a separate practice run at the selected parent revision, preserving lineage but not technical proof. It uses the existing learner-owned lab; it is not a VM snapshot, isolated lab clone or concurrent alternative infrastructure. The UI makes this explicit.
- Troublefest is a timed individual mission mode. The deadline is server-assigned and checked both before and after provider verification. Forks are always untimed practice and cannot reset a timed win. There are no public leaderboards or cash awards.
- Completion reuses the Docker observation adapter and writes the existing `academy_mission_progress` source. No simulated choice, client result or AI verdict can mint proof. XP is not consulted or awarded by this engine.
- Owner advisory locks, optimistic run revisions, five-active-run limits, CSRF and fail-closed rate limits bound concurrent mutations and retry abuse.

## Scope and remaining live verification

This delivers the mission engine with the existing three Docker missions. Additional platform/cloud mission packs, multi-user competitive Troublefest, independent VM snapshot branches, and a visual infrastructure simulator are not implemented. Hypothesis choices are deterministic teaching steps, clearly distinct from live verification.

A real supported, running, learner-owned AWS Linux lab with Docker and SSM is required to seed/verify. Explicit incident consent permits resetting only the existing reserved Academy container. No infrastructure is provisioned by this PR. Existing Live Workspace and free mentorship use the same services and permissions. Failure between a provider operation and transaction commit can require retrying bounded incident preparation; the command targets the same reserved resource.

Before deployment: apply migrations through 065 in order; verify checksums/parity; run all unit/integration/security/build checks and real desktop/mobile tests; validate SSM seeding and verification in a disposable Docker lab. Do not enable E2E authentication in a deployed environment.
