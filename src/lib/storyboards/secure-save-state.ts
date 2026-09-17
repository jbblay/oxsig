'use client';

import type { StoryboardDraft } from './types';

type PendingServerCommit = {
  draftId: string;
  serverId: string;
};

const pendingServerCommits = new Map<string, PendingServerCommit>();

/**
 * Records that the authoritative server write has already committed. The next
 * local recovery metadata write for this exact draft/server pair must not be
 * allowed to turn that durable success into a reported server failure.
 */
export function markStoryboardServerCommit(draftId: string, serverId: string): void {
  pendingServerCommits.set(draftId, { draftId, serverId });
}

/** Clears a pending marker after the local recovery metadata catches up. */
export function clearStoryboardServerCommit(draft: StoryboardDraft): void {
  const pending = pendingServerCommits.get(draft.id);
  if (pending && draft.serverId === pending.serverId) {
    pendingServerCommits.delete(draft.id);
  }
}

/**
 * Consumes a marker when the post-commit local recovery write fails. Returning
 * true means the server is already durable and only browser recovery metadata
 * is degraded; callers should surface the recovery error without undoing or
 * misreporting the server save.
 */
export function consumeStoryboardServerCommit(draft: StoryboardDraft): boolean {
  const pending = pendingServerCommits.get(draft.id);
  if (!pending || !draft.serverId || draft.serverId !== pending.serverId) return false;
  pendingServerCommits.delete(draft.id);
  return true;
}
