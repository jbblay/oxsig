# OXSIG Real-User Persistence Audit

## Goal

Move OXSIG beyond MVP/demo/browser-owned behavior so authenticated user state is durable, owner-scoped, and reconstructable from server-side sources of truth.

The governing rule for this audit is:

> Normal user-owned product state must survive refresh, browser/device changes, and relogin because PostgreSQL or another deliberate server-side store is authoritative. Browser storage may remain only for device preferences, ephemeral handoffs, or one-time legacy migration. Integrity-sensitive evidence must preserve the identity of the real execution that produced it.

This audit started from `main` merge commit `1c71c3e86bf2fe19c34f5c7eae939708598a6bc4`, after the owner-lifecycle phase landed. The Academy / AI Practitioner server-first phase landed in PR #116 at merge commit `12786f5229d0d7129610fbd0bf041c4b0af6e387`; Cyber Lab topology hardening continues from that exact merge.

## Findings and decisions

| Surface | Previous behavior | Classification | Result |
| --- | --- | --- | --- |
| Academy course/progress | The Academy page read and wrote the active course and lesson progress through `localStorage`; a background bridge synchronized that browser state to PostgreSQL afterward. | Critical user state incorrectly had the browser in the write path. | Replaced with a server-first durable state provider. Academy layout preloads the authenticated owner's PostgreSQL state; lesson navigation/review writes directly to `/api/academy/state`. |
| Legacy Academy browser state | Existing installations may still contain `oxsig:academy-course:v1` / progress keys. | User data must not be discarded during migration. | If no durable server course exists, the provider imports the legacy browser course once through the authenticated Academy state API. Browser keys are cleared only after successful import; failed migration leaves them intact for retry. |
| Academy Q&A | Questions/answers were already persisted in PostgreSQL but the page did not reconstruct them from server state after refresh. | Durable user learning history. | Server-first Academy hydration restores owner-scoped Q&A into the lesson UI. |
| Academy practice result | Command/output/evaluation was already persisted, but the persisted result did not retain the exact execution/evidence/receipt identity used by the UI. `lab_instance_id` was accepted by persistence but omitted by the Academy evaluate route. | Integrity-sensitive learning state. A restored "passed" result must remain bound to the execution that proved it. | New practice evaluations persist an optional exact evidence binding inside the evaluation JSON: evidence ID, execution ID, original lab ID, provenance, terminal session, execution receipt, risk and surface. The exact lab ID is also written to `academy_practice_attempts`. Refresh reconstructs the UI from that binding. Older attempts remain readable without fabricated identifiers. |
| AI Practitioner visible history | Plan/execution/analysis events were already durable in `ai_practitioner_events`, but the dock kept its visible entries/history only in React memory. Refresh/relogin presented an empty session. | Missing durable read model, not missing durable storage. | Added authenticated owner-scoped `GET /api/ai/practitioner`, reconstructing recent plans, executions and analyses from existing events. The dock restores persisted history before accepting new input. Non-command answers and evidence-backed executed plans are restorable; unfinished executable plans are intentionally not resurrected after refresh and must be regenerated in the current lab context. |
| AI Practitioner lab provenance | Restored historical evidence could otherwise be displayed while another lab is currently running. | Evidence must retain its original resource identity. | History entries preserve their original `lab_instance_id`. Vault capture uses the original lab ID rather than whichever lab happens to be active when the user revisits the history. |
| Migration 001 test identity | Every fresh database inserted `Test User` / `test@oxsig.local`. | MVP seed data must not appear as real product data. | Forward migration 042 removes the exact synthetic identity only when no current foreign-key reference points to it. Any seed identity that accumulated referenced data is preserved to avoid cascade data loss. |
| Migration 004 sample collaboration | A `Test Collaboration` could be inserted when `test@example.com` existed. | MVP sample data must not become user-owned production state. | Forward migration 042 selects only the exact original sample by all seed-defining fields, then removes it only if no current foreign-key reference points to it. A reused sample collaboration is preserved rather than cascaded away. |
| Cyber Lab topology | PostgreSQL was hydrated first by `LabTopologyPersistenceBridge`, but `LabRuntimePanel` then edited a `localStorage` copy and relied on browser-change observation to PUT the graph back to the server. | Durable user-owned topology still had the browser in the write path. | Replaced with a durable topology provider plus direct client. The authenticated server topology is authoritative; ReactFlow hydrates from that state and debounces direct authenticated PUTs from the in-memory graph. Saves are serialized so an older request cannot finish after and overwrite a newer graph. The old bridge is removed. |
| Legacy Cyber Lab topology | Existing browsers may still contain `oxsig:cyber-lab-topology:v1`. | Legacy user data must be migratable without allowing stale browser state to override the server. | The legacy key is consulted only after a successful server GET explicitly confirms that no durable topology exists. It is schema-validated and imported through the authenticated topology API, and is cleared only after successful persistence. A server read failure never falls back to the browser copy. |
| Cyber Lab runtime-node mapping | Browser key associates the current ephemeral instance with a visual node. | Device/session convenience; authoritative lab instance remains server-owned. | Keep local. |
| Cyber Lab / app panel layout | Sidebar, panel-open/collapsed and similar settings use browser storage. | Device-specific UI preference, not user resource data. | Keep local intentionally. |
| Vault → Lab handoff | Vault stores a short-lived local handoff payload used to prefill AI Practitioner after navigation. | Ephemeral navigation intent; source Vault item is already durable. | Keep local intentionally; it is not authoritative state. |
| Curated learning path / lab catalog | Course path definitions and lab profiles are code-defined reference data. | Product/reference configuration, not user-owned state. | Keep static by design. |
| Academy Explore side topic | Explicitly presented as a temporary exploration path. | Intentional ephemeral experience rather than claimed durable course ownership. | No persistence added in this batch. A user can create/activate a durable Academy course through the normal course flow. |
| Completed reflections / execution evidence / audit receipts | Already server-produced and integrity-sensitive. | Historical proof. | Remain immutable except through deliberate parent-resource lifecycle semantics established in the owner-lifecycle phase. |

## Browser-storage policy after this audit

Browser storage is acceptable only when at least one of these is true:

1. **Device preference:** layout, collapsed panels, local presentation mode.
2. **Ephemeral navigation handoff:** short-lived context passed between already-durable surfaces.
3. **Legacy migration only:** existing MVP data is read once and imported into the authenticated server store; new writes never depend on the legacy key.
4. **Non-authoritative cache:** the server remains the explicit source of truth and a lost cache cannot erase the user's durable resource.

A feature does **not** satisfy real-user persistence merely because a later background bridge eventually copies browser state to PostgreSQL.

## Cross-resource invariants

1. Owner scope is enforced by authenticated server routes/queries, never only by UI state.
2. New Academy course/progress writes no longer require `localStorage` to succeed.
3. Legacy Academy data is never cleared until server import succeeds.
4. New Academy practice records can reconstruct the same exact evidence identity after refresh.
5. AI Practitioner history is read back from the same owner-scoped event store already used for durable writes.
6. Historical AI Practitioner evidence retains its original lab identity when later saved into Vault.
7. Unfinished executable AI plans are not made runnable again by a later refresh; they are regenerated against the current lab context.
8. Cyber Lab topology loads from the authenticated server before the runtime editor mounts; failure to read durable state blocks editing instead of opening an empty/stale browser graph.
9. New Cyber Lab topology mutations persist directly from the validated ReactFlow model; the legacy topology key is migration-only and is never a new-write target.
10. Rapid topology mutations are serialized behind the previous save so stale completion order cannot overwrite newer server state.
11. Legacy MVP seed cleanup is exact-match and non-destructive; both synthetic identities and sample resources are retained whenever current foreign-key relationships show that they have accumulated data.
12. UI/device preferences are not promoted into database tables simply to satisfy a persistence checklist.

## Completed hardening: Cyber Lab topology

Cyber Lab topology no longer depends on a browser write-behind bridge.

The completed flow is:

- load the authenticated owner's topology directly from `/api/labs/topology` before mounting the runtime editor,
- validate server and legacy payloads against the same topology schema used by the API,
- import a legacy browser topology only when the server explicitly reports no durable topology,
- mutate the in-memory ReactFlow model normally,
- serialize only server-supported node/edge fields,
- debounce direct authenticated `PUT /api/labs/topology` writes,
- retry transient `408`, `429`, `5xx`, and network failures within the direct save operation,
- serialize saves so write completion order cannot regress the graph,
- remove `LabTopologyPersistenceBridge`,
- preserve `RUNTIME_NODE_KEY`, workspace mode, and layout keys only as device/session conveniences.

A failed authoritative GET does not open the runtime editor on a stale browser copy. A failed legacy import does not delete the legacy browser value. This makes data-loss behavior fail closed rather than allowing local state to silently replace unknown server state.

## Validation requirement

Before merge, the exact candidate must pass the repository CI gates:

- database migrations,
- schema parity,
- production checks,
- TypeScript typecheck,
- full Vitest suite,
- real PostgreSQL parameter-boundary integration,
- production build.

The Remote Desktop connection was unavailable during this phase, so GitHub CI is the authoritative executable validation environment for this branch.
