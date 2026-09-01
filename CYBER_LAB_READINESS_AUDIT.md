# OXSIG Cyber Lab Readiness Audit

## Purpose

OXSIG is being evolved into a practical cybersecurity platform and cyber range without deleting or replacing its existing product areas. The goal is to preserve the current security-first application and progressively connect its existing concepts to real, isolated, measurable functionality.

Core principle:

> Do not change what OXSIG is. Make what OXSIG already is real.

This document records the first repository-level audit before lab orchestration is introduced.

## Current Architecture

- Next.js 15 / React 19 frontend and API routes.
- Custom Node server with Socket.IO for real-time signaling and rooms.
- PostgreSQL for server-side data.
- MinIO-compatible S3 storage APIs.
- Redis and MeiliSearch are present in Docker Compose.
- Caddy and Coturn configuration exist in the repository.
- Browser-side IndexedDB is used for several local-first features.
- WebRTC/P2P networking is implemented in the browser.
- WebAuthn, cryptographic utilities, notifications, offline/PWA support and Tauri scaffolding exist.
- GitHub Actions CI exists for type checking, linting, vulnerability scanning, builds and Docker checks.

The existing stack is suitable for extension. A framework rewrite is not justified.

## Feature Reality Map

### Authentication — REAL, needs hardening

The application has email/password authentication, bcrypt password verification, Ed25519-signed access and refresh tokens, httpOnly cookies, session records, rate limiting and audit hooks.

Hardening items:

- Registration currently logs the parsed request body and can therefore log plaintext passwords.
- JWT key bootstrap behavior can print a newly generated private signing key to logs when environment keys are missing.
- Top-level route middleware checks token presence for selected routes rather than validity. API-level `requireAuth` performs actual JWT verification.
- The protected-route list does not cover all sensitive API families.

### Collaboration — PARTIALLY REAL

The collaboration API has meaningful PostgreSQL-backed ownership and membership checks, parameterized queries, roles and permissions. This is a strong reusable model for future team labs.

However, the UI currently states that messages are end-to-end encrypted while the reviewed message API stores message content directly in PostgreSQL. That claim must either be backed by real client-side E2EE or represented accurately.

### Network — REAL FOUNDATION

The Network page is not merely a static mock. It creates a browser P2P node, uses WebRTC DataChannels, supports manual/QR signaling, tracks peers, heartbeat health and RTT, and verifies peer hello messages with Ed25519 signatures.

This feature should be preserved. Future cyber-range topology should be introduced as a separate practical lab topology mode rather than replacing existing P2P functionality.

### Secure Storage — TWO DISTINCT IMPLEMENTATIONS

1. The Secure Storage UI uses browser IndexedDB with client-side AES-256-GCM and PBKDF2-SHA256. This is real local encrypted storage.
2. Server-side `/api/storage/*` routes use MinIO/S3-compatible storage.

The MinIO API path currently needs urgent authorization work. Reviewed upload/download routes do not bind objects to the authenticated user, use fallback development credentials, and allow object access based on supplied bucket/key values. These routes must not be treated as production-safe secure storage until ownership checks are enforced.

### Audit — PARTIAL / CLAIMS NEED CORRECTION

There are multiple audit concepts:

- PostgreSQL server-side audit/activity tables.
- Browser-local IndexedDB audit events.
- Browser-generated Merkle roots/proofs.

The UI describes the trail as immutable, but browser-local IndexedDB is user-modifiable and therefore not authoritative immutable storage. Future work should separate:

- authoritative OXSIG platform audit,
- lab telemetry/events,
- optional integrity anchoring/Merkle proofs.

### OPSEC — SELF-ASSESSMENT UI

The current OPSEC score and classification are calculated from local checkbox state. The checklist is useful, but checking an item does not verify that the corresponding control is actually active.

Preserve the feature and progressively add real posture checks and practical OPSEC labs. Until then, describe it as checklist/self-assessment rather than verified posture.

### AI Security — SIMULATED UI

The reviewed AI Security page uses hard-coded trust scores, model accuracy, threat counts, anomaly counts, event feeds, CPU usage and training progress. No backend source was present in the reviewed page.

Preserve the feature, but do not present simulated values as real telemetry. Later this page can consume real lab/security telemetry and detection outputs.

### Security Center — MIXED

Real components include WebAuthn-related UI and device-management integrations. Other areas contain hard-coded DID values, key lists, activity rows and threat-monitor values.

Preserve the feature. Clearly distinguish real account/device data from placeholders, then replace placeholders with actual telemetry over time.

### Identity — MOSTLY UI / PLACEHOLDER

The current page contains a hard-coded DID, static credentials and a static trust score. Existing DID libraries/APIs elsewhere in the repository should be evaluated and connected before claims are treated as live identity state.

### Privacy — MOSTLY LOCAL UI STATE

Privacy toggles and the privacy score are currently client-side state. Preserve them, but connect controls to actual behavior before describing them as enforced security guarantees.

### Seed Vault — EXPERIMENTAL / MUST NOT BE OVERCLAIMED

The reviewed seed-vault implementation explicitly contains a truncated BIP39 word list, simplified mnemonic mapping, simplified/non-cryptographic Shamir behavior and password-to-AES-key logic that does not use a password KDF.

The feature must remain, but it should not be represented as full production BIP39/social recovery until its cryptographic implementation is corrected and independently tested.

### Offline Mode — REAL PWA FOUNDATION, PRIVACY HARDENING NEEDED

A service worker implements pre-caching, runtime caching and offline behavior. It currently caches GET `/api/` responses generically. For a security application this can cache authenticated/private API data in Cache Storage and should be narrowed to explicitly safe public/cacheable endpoints.

### Advanced Features — MIXED

WebAuthn capability checks, push notifications, voice command infrastructure, QR functionality and offline data plumbing exist. Several demo identities/operations are still present. Preserve these features and connect them to real authenticated user state.

## Immediate Security Findings Before Cyber Labs

The following should be addressed before OXSIG provisions deliberately vulnerable machines:

1. Fix response-header middleware so applying headers preserves redirects/errors instead of replacing them with a new `NextResponse.next()` response.
2. Remove sensitive registration request-body logging.
3. Never print JWT private signing keys to logs. Production should fail closed if signing keys are missing.
4. Add real authentication, ownership and authorization to server-side storage APIs.
5. Authenticate Socket.IO connections with verified OXSIG credentials and authorize room/resource joins.
6. Stop indiscriminate caching of authenticated API responses in the service worker.
7. Apply CSRF protection consistently to cookie-authenticated state-changing endpoints where appropriate.
8. Move distributed rate limiting to Redis before multi-instance scaling.
9. Remove or clearly label unsupported security claims and simulated telemetry.
10. Add tests for authorization boundaries, storage IDOR, socket authorization, lab ownership and isolation.

## Cyber Lab Architecture Boundary

Cyber labs must not run inside the OXSIG application trust zone.

Target trust model:

```text
User Browser
    |
    v
OXSIG Application/API
    |
    v
Lab Control Service / Orchestrator
    |
    +---------------------------+
    |                           |
    v                           v
Isolated Lab Network A     Isolated Lab Network B
    |                           |
    +-- Lab nodes               +-- Lab nodes
```

Rules:

- Lab networks must not join the core `oxsig-network`.
- Assume the learner can obtain root/Administrator inside a lab.
- Root in a lab must not provide access to the host, Docker socket, orchestrator, OXSIG database, MinIO administration, Redis, secrets or another user's lab.
- No unrestricted Internet egress by default.
- Resource limits and timeouts are mandatory.
- Every lab instance belongs to an authenticated user or authorized collaboration/team.
- Server-side authorization must be checked on every lab control and terminal connection.

## Recommended Lab Data Model

Introduce lab data incrementally after hardening. Likely entities:

- `lab_definitions` — immutable/versioned exercise templates.
- `lab_instances` — user-owned runtime instances and lifecycle state.
- `lab_nodes` — machines/containers belonging to an instance.
- `lab_events` — lifecycle/validation events, separate from platform audit.
- `lab_artifacts` — PCAPs, logs, reports and other outputs that can optionally be exported to Secure Storage.

Do not hard-code each exercise into application business logic. Lab definitions should describe category, difficulty, machines, network, resources, objectives, validation and reset behavior.

## MVP Sequence

### Phase 0 — Hardening

Complete the security fixes above. No vulnerable workloads yet.

### Phase 1 — Orchestrator Contract

Create an internal lab service interface for:

- provision
- start
- status
- stop
- reset
- destroy
- validate

Keep the first implementation behind a feature flag/admin-only path until isolation is verified.

### Phase 2 — First Linux Lab

One disposable Linux environment with:

- authenticated launch,
- strict resource limits,
- isolated network,
- browser terminal,
- timeout,
- validation,
- reset/destroy.

The first exercise should prove lifecycle and security boundaries rather than maximize offensive complexity.

### Phase 3 — Two-Node Network Lab

Introduce an isolated attacker/target pair and prove per-lab networking without Internet egress or access to OXSIG infrastructure.

### Phase 4 — VM Runtime

Only after container lifecycle/isolation is mature, introduce full VMs for Windows, kernel exercises, Active Directory and similar scenarios.

## Product Mapping

Existing features should become practical rather than disappear:

- **Network** → retain P2P topology and add isolated lab topology builder.
- **Security Center** → display real lab telemetry/detections.
- **OPSEC** → retain checklist and add practical OPSEC scenarios/posture verification.
- **Audit Log** → authoritative platform audit plus separate lab event timeline.
- **Identity** → real authenticated identity and identity-security labs.
- **Privacy** → real privacy controls and information-leakage labs.
- **Secure Storage** → preserve encrypted storage and allow export of lab evidence/artifacts.
- **Seed Vault** → retain but cryptographically harden before strong security claims.
- **Collaboration** → team labs, instructor/student workflows, red/blue scenarios.
- **AI Security** → real detections/analysis sourced from telemetry, never fabricated counters.
- **Offline Mode** → preserve safe cached/local capabilities without caching private API responses indiscriminately.
- **Advanced Features** → preserve WebAuthn, notifications, voice and other supported capabilities and integrate them into lab workflows where useful.

## Non-Negotiable Principles

- Preserve existing features.
- Do not rebuild OXSIG from scratch.
- Do not run intentionally vulnerable systems in the OXSIG application trust zone.
- Never trust client-supplied ownership or authorization.
- Never expose container/hypervisor management interfaces to lab users.
- Never present simulated telemetry as live security data.
- Prefer one complete vertical slice over many unfinished lab pages.
- Keep changes small, testable and reversible.
- Build it. Attack it. Defend it. Observe it. Understand it. Reset it.
