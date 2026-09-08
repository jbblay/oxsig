# OXSIG Owner Lifecycle Audit

## Scope

This audit moves OXSIG from MVP/demo lifecycle behavior toward durable authenticated-user ownership. The governing rule is:

> A normal resource owned by an authenticated user should expose the lifecycle controls that are reasonable for that resource. Evidence, audit, authorization receipts, and other integrity-sensitive records should not receive arbitrary edit/delete controls merely to satisfy a CRUD checklist.

This branch starts from the validated PR #114 candidate (`d047a807338fcf75270d14131f5b5200a5abd5fb`) so the PostgreSQL JSON/text boundary fixes are retained.

## Resource lifecycle matrix

| Resource | Existing behavior | Audit decision | Result in this branch |
| --- | --- | --- | --- |
| Academy course | Create/read/progress update; top-level DELETE only archived the active course | User-owned durable resource. Needs item-level inspect, activate, archive and permanent delete. Session/history rows remain subordinate to the course. | Added owner-scoped GET/PATCH/DELETE at `/api/academy/courses/[id]`; hard delete cascades course progress, questions, practice attempts, sessions, reflections and mastery. |
| Academy session | Automatically created/completed/abandoned | Session is lifecycle/history for a course, not an independently editable note. | No arbitrary session editing. Course archive abandons an active session; course activation starts a new session; course delete cascades sessions. |
| Curated capability-path enrollment | Start/resume only | Enrollment is user-controlled; demonstrated capability evidence must survive a normal leave. | Added `PATCH { action: 'abandon' }`; leaving archives the active curated Academy course but preserves capability evidence; resuming reactivates enrollment. Academy course activation/archive/delete also keeps enrollment state aligned. |
| Academy reflection | Prediction/explanation bound to exact execution evidence | Integrity-sensitive learning evidence. Editing/deleting a completed reflection would invalidate the prediction-before-execution and explain-back contract. | Intentionally immutable as an independent resource. It is deleted only as part of explicit parent Academy-course deletion. |
| Capability evidence | Derived from practice/reflection/assessment sources | Durable proof while its source exists. It must not survive explicit deletion of the source and claim proof that can no longer be inspected. | Migration 041 removes practice/reflection-derived capability evidence when those exact Academy source rows are deleted. |
| Collaboration session | List/create, messages, members and attachments; no item owner route | User-owned resource. Needs inspect, rename/update and permanent delete. | Added `/api/collaborations/[id]` GET/PATCH/DELETE; delete requires S3 prefix cleanup to succeed before relational data is removed. |
| Collaboration membership | Add/invite only | Owners/admins need member removal; members need a leave action. Owner identity cannot be removed from its own collaboration. | Added `/api/collaborations/[id]/members/[userId]` DELETE with owner/admin/self policy and Live Workspace control revocation when applicable. |
| External collaboration invitation | Create/accept; schema already supported `revoked` | Future-access token must be revocable by the collaboration owner. | Added owner list/revoke API at `/api/collaborations/invitations`; surfaced pending invitations and Revoke control in `/manage`. |
| Live Workspace | Create/list/detail; control-role/resource APIs; no workspace lifecycle mutation | User-owned collaborative envelope. Correct lifecycle is metadata update, safe end, and permanent delete. | Added PATCH name/description/end and DELETE. End cancels pending control requests, revokes active leases, and ends workspace/collaboration atomically; permanent delete requires attachment cleanup first. |
| Live Workspace participant | Role change only | Owner needs removal; participant needs leave; control authorization must be revoked first. | Added participant DELETE with owner/self policy and control revocation. |
| Live Workspace resource binding | Manual attach/detach, but underlying resource could be archived/deleted independently | Polymorphic binding must never remain active when its resource is no longer available. | Migration 041 automatically detaches bindings when Academy courses/Vault items/Storyboards are archived or deleted, labs are destroying/destroyed, or infrastructure designs are deleted. Server-side attachment validation also rejects archived Academy courses and destroying/destroyed labs so a caller cannot bypass the UI and reattach an unavailable resource. |
| Vault item | GET/list/create/update/delete/archive already present | Existing lifecycle is appropriate. | Kept CRUD. Strengthened delete with transactional workspace detachment; migration 041 also covers archive/delete outside that route. |
| Storyboard | Create/read/update/archive/delete/share already present | Existing lifecycle is appropriate. | Kept CRUD. Migration 041 prevents stale Live Workspace bindings after archive/delete. |
| Cyber Lab instance | Provision/start/stop/destroy plus execution/readiness evidence | Runtime resource, not ordinary row CRUD. Destroy is the correct destructive operation; retaining lifecycle/audit rows is intentional. | Kept operational lifecycle. Migration 041 detaches a bound lab when it enters destroying/destroyed; attach validation rejects both states. |
| Infrastructure design | One durable design per user; GET/PUT only | User-owned working state. Needs a reset/delete operation. | Added authenticated DELETE and `/manage` Reset design control. |
| Storage objects | Upload/list/download/delete-multiple already present | Blob lifecycle is already create/read/delete oriented; arbitrary update semantics are not required. | No additional CRUD added in this batch. |
| User profile | GET/PATCH local profile; identity owned by Clerk | Local user-row deletion alone would not equal account deletion and can be recreated by identity synchronization. | Account deletion intentionally deferred until Clerk identity deletion and local-data cleanup can be coordinated as one product flow. |
| Execution evidence / readiness evidence / audit logs / authorization receipts | System-produced history | Integrity-sensitive evidence. | Intentionally no arbitrary edit/delete CRUD. Parent-resource lifecycle may remove ordinary dependent state, but audit/evidence is preserved where its schema requires preservation. |

## Cross-resource invariants added

1. Owner scope is enforced in SQL for destructive and metadata mutations; UI visibility is not treated as authorization.
2. State-changing routes require CSRF validation and rate limiting.
3. Permanent Academy course deletion removes capability evidence derived from practice/reflection rows that are deleted by the course cascade.
4. Live Workspace bindings are detached automatically when the underlying owner resource becomes archived, destroyed, or deleted.
5. Ending a Live Workspace revokes/cancels machine-control authorization before the workspace becomes unavailable.
6. Removing a Live Workspace participant revokes that participant's active control leases and pending control requests.
7. Collaboration and Live Workspace permanent deletion validates owner scope first, requires S3 attachment-prefix cleanup to succeed, and only then removes relational state. If storage cleanup fails, the API returns an error and leaves the database resource intact rather than claiming deletion while orphaned files remain.
8. Live Workspace attachment authorization re-validates availability server-side; archived Academy courses and destroying/destroyed labs cannot be reattached by bypassing the UI.
9. Academy course lifecycle and curated journey enrollment cannot contradict each other: activating the curated reference course activates the journey, while switching away from it, archiving the active course, or deleting the active course abandons the active journey without erasing evidence.

## User-visible management surface

`/manage` is added to the main sidebar and centralizes owner controls for:

- curated learning journey enrollment,
- Academy courses,
- owned collaboration sessions,
- pending external collaboration invitations,
- owned Live Workspaces,
- saved infrastructure design.

Feature-specific screens remain responsible for normal day-to-day interaction, while `/manage` provides a predictable place for destructive and lifecycle controls.

## Deliberate non-CRUD decisions

The audit does **not** add edit/delete buttons to every table. In particular, Academy reflections, execution evidence, readiness evidence, control/audit records, and similar proof records retain integrity-oriented semantics. The user controls the parent working resource or enrollment lifecycle without gaining an ability to rewrite historical proof.

## Validation target

Before merge, the candidate must pass the repository CI from this exact branch, including:

- migrations,
- schema parity,
- production checks,
- TypeScript typecheck,
- full Vitest suite,
- real PostgreSQL parameter-boundary integration tests inherited from PR #114,
- production build.

The local Remote Desktop connection was unavailable during this implementation, so GitHub CI is the authoritative validation environment for this branch.
