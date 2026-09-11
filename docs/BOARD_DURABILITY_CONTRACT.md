# Board durability contract

Boards use two storage layers with one user-facing meaning:

- **Save** means the Board is durably stored in OXSIG server state.
- Browser IndexedDB is only a recovery mechanism for unfinished or failed saves.
- A recovery draft that points to a deleted owner Board may be recreated as a new server Board on the next save.
- A revoked editor/viewer recovery draft must never silently fork into a new owner Board.

Sharing follows the same recipient contract as Collaboration:

- Existing active OXSIG account: grant viewer/editor access immediately.
- Unknown email: create an expiring invitation and send it through the configured email provider.
- Invitation tokens are random, only SHA-256 hashes are stored, and acceptance requires the signed-in account email to match the invited email.
- Pending invitations can be revoked by the Board owner.
- Accepted invitations become ordinary `storyboard_shares` grants.

The guest-safe invitation handoff lives at `/board-invite/[token]`. Legacy email links under `/collab/storyboards/invite/[token]` are redirected there before the authenticated Boards layout runs.
