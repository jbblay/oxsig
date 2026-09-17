# Browser Persistence Policy

OXSIG treats authenticated user resources as server-authoritative. Browser persistence is permitted only when losing the browser copy cannot erase or redefine the authoritative resource.

Approved categories are deliberately narrow:

1. **Device preference** — layout, presentation mode, walkthrough position, teaching mode, or similar device-local UX state.
2. **Ephemeral handoff or retry state** — short-lived context between already durable surfaces, including request retry snapshots.
3. **Legacy migration** — read/clear access used only to import an older browser-owned value into an authenticated server store. New authoritative writes must not target the legacy key.
4. **Non-authoritative recovery/cache** — account-scoped drafts or recovery data whose loss does not remove the durable server resource. Recovery storage must not silently overwrite an unknown server state.

## CI enforcement

`scripts/persistence-policy-check.mjs` scans production source files for browser persistence writers. Every Web Storage writer and IndexedDB writer must be explicitly allowlisted with a reason. The check also rejects unreviewed use of cookie writes, Cache Storage, and the Origin Private File System.

Run it locally with:

```bash
pnpm persistence:check
```

The main CI workflow runs the same command on every non-draft pull request.

### Adding browser persistence

Do not add an allowlist entry merely to make CI green. A change that introduces a new browser persistence writer must document why the state fits one of the approved categories above. If losing that state could erase, fork, or redefine an authenticated user's authoritative resource, move the source of truth to PostgreSQL or another deliberate server-side store instead.

Stale allowlist entries are treated as failures. When a browser writer is removed, its exception must be removed from the checker as well.

This policy complements `REAL_USER_PERSISTENCE_AUDIT.md`; it turns the audit's browser-storage rule into an executable regression boundary.
