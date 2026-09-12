# Board durability contract

Boards use two storage layers with one user-facing meaning:

- **Save** means the Board is durably stored in OXSIG server state.
- Browser IndexedDB is only a recovery mechanism for unfinished or failed saves.
- A recovery draft that points to a deleted owner Board may be recreated as a new server Board on the next save.
- A revoked editor/viewer recovery draft must never silently fork into a new owner Board.

## Local recovery identity boundary

Browser recovery drafts are isolated by an explicit storage namespace:

- Authenticated recovery uses `account:<sessionIdentityId>`, where `sessionIdentityId` is the stable opaque Clerk account identifier. Email addresses, usernames, and display names are not stored merely to construct the namespace.
- Signed-out recovery uses the explicit `guest` namespace.
- Every scoped IndexedDB read, write, list, and delete requires the namespace; there is no unscoped fallback.
- Draft records, including any associated audio `Blob`, live behind the same compound `[namespace, id]` key boundary.
- The Board waits for Clerk identity resolution before enabling local recovery. When identity changes, the visible recovery list and active local workspace are cleared while the next namespace is loaded.
- Debounced or otherwise pending saves capture the namespace that was current when the operation was scheduled. A completion from an old namespace may finish writing only to that old namespace and may not repopulate the new account's UI.

IndexedDB schema version 2 keeps the version-one `drafts` store intact but quarantined. Those historical records have no trustworthy account identity, so they are not automatically assigned to the next authenticated account or to guest. New recovery data is written only to `scoped-drafts`. A future explicit recovery/import flow may offer a user-controlled way to adopt quarantined legacy drafts; automatic claiming is intentionally forbidden.

Sharing follows the same recipient contract as Collaboration:

- Existing active OXSIG account: grant viewer/editor access immediately.
- Unknown email: create an expiring invitation and send it through the configured email provider.
- Invitation tokens are random, only SHA-256 hashes are stored, and acceptance requires the signed-in account email to match the invited email.
- Pending invitations can be revoked by the Board owner.
- Accepted invitations become ordinary `storyboard_shares` grants.

The guest-safe invitation handoff lives at `/board-invite/[token]`. Legacy email links under `/collab/storyboards/invite/[token]` are redirected there before the authenticated Boards layout runs.
