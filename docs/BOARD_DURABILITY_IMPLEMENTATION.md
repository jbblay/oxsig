# Board durability implementation

This slice fixes two observed Board contract failures without redesigning the workspace.

- Stale owner recovery drafts no longer get trapped retrying a deleted server Board ID. A failed owner PATCH with 404 is retried as a fresh server create.
- Editor/viewer recovery drafts never use that fallback, so revoked shared access cannot silently become a private fork.
- Board sharing now mirrors Collaboration: existing users receive an immediate grant; unknown emails receive a durable seven-day invitation.
- Invitation tokens are hashed at rest, acceptance is email-bound, and pending invitations are owner-revocable.
- Signed-out invitation recipients are routed to a guest-safe handoff before the authenticated Boards layout mounts.
- Schema parity now requires the invitation relation.

The existing IndexedDB draft remains recovery-only. It is not treated as the durable user-facing Save result.
