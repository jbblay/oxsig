'use client';

export type StoryboardDraftIdentity = string | null | undefined;

let activeDraftIdentity: StoryboardDraftIdentity = undefined;
let draftScopeWaiters = new Set<(scope: string) => void>();

function normalizeScope(identityId: StoryboardDraftIdentity): string | undefined {
  if (identityId === undefined) return undefined;
  return identityId ? `account:${identityId}` : 'guest';
}

/**
 * Bind browser-only recovery drafts to the resolved Clerk identity. Passing
 * `undefined` means authentication is still resolving; reads wait instead of
 * falling back to a shared browser namespace. Passing `null` selects the
 * browser's guest namespace.
 */
export function setStoryboardDraftScope(identityId: StoryboardDraftIdentity): void {
  activeDraftIdentity = identityId;
  const ready = normalizeScope(identityId);
  if (!ready) return;

  for (const resolve of draftScopeWaiters) resolve(ready);
  draftScopeWaiters = new Set();
}

export async function getStoryboardDraftScope(): Promise<string> {
  const ready = normalizeScope(activeDraftIdentity);
  if (ready) return ready;

  return new Promise((resolve) => {
    draftScopeWaiters.add(resolve);
  });
}
