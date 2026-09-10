'use client';

import { openDB, type DBSchema } from 'idb';
import type { StoryboardDraft } from './types';

const DB_NAME = 'oxsig-storyboards';
const DB_VERSION = 1;
const STORE_NAME = 'drafts';

type DraftScope = string | null | undefined;

let activeDraftScope: DraftScope = undefined;
let draftScopeWaiters = new Set<(scope: string) => void>();

interface StoryboardDB extends DBSchema {
  drafts: {
    key: string;
    value: StoryboardDraft;
    indexes: {
      'by-updated': number;
    };
  };
}

async function getDB() {
  return openDB<StoryboardDB>(DB_NAME, DB_VERSION, {
    upgrade(db) {
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const store = db.createObjectStore(STORE_NAME, { keyPath: 'id' });
        store.createIndex('by-updated', 'updatedAt');
      }
    },
  });
}

function normalizeScope(identityId: DraftScope): string | undefined {
  if (identityId === undefined) return undefined;
  return identityId ? `account:${identityId}` : 'guest';
}

function storagePrefix(scope: string): string {
  return `${scope.length}:${scope}:`;
}

function storageId(scope: string, id: string): string {
  return `${storagePrefix(scope)}${id}`;
}

function fromStoredDraft(scope: string, draft: StoryboardDraft | undefined): StoryboardDraft | undefined {
  if (!draft) return undefined;
  const prefix = storagePrefix(scope);
  if (!draft.id.startsWith(prefix)) return undefined;
  return { ...draft, id: draft.id.slice(prefix.length) };
}

async function getDraftScope(): Promise<string> {
  const ready = normalizeScope(activeDraftScope);
  if (ready) return ready;

  return new Promise((resolve) => {
    draftScopeWaiters.add(resolve);
  });
}

/**
 * Bind browser-only recovery drafts to the resolved Clerk identity. Passing
 * `undefined` means authentication is still resolving; reads wait instead of
 * falling back to a shared browser namespace. Passing `null` selects the
 * browser's guest namespace.
 */
export function setStoryboardDraftScope(identityId: DraftScope): void {
  activeDraftScope = identityId;
  const ready = normalizeScope(identityId);
  if (!ready) return;

  for (const resolve of draftScopeWaiters) resolve(ready);
  draftScopeWaiters = new Set();
}

export async function saveStoryboardDraft(draft: StoryboardDraft): Promise<void> {
  const scope = await getDraftScope();
  const db = await getDB();
  await db.put(STORE_NAME, { ...draft, id: storageId(scope, draft.id) });
}

export async function getStoryboardDraft(id: string): Promise<StoryboardDraft | undefined> {
  const scope = await getDraftScope();
  const db = await getDB();
  return fromStoredDraft(scope, await db.get(STORE_NAME, storageId(scope, id)));
}

export async function listStoryboardDrafts(): Promise<StoryboardDraft[]> {
  const scope = await getDraftScope();
  const db = await getDB();
  const drafts = await db.getAll(STORE_NAME);
  return drafts
    .map((draft) => fromStoredDraft(scope, draft))
    .filter((draft): draft is StoryboardDraft => Boolean(draft))
    .sort((a, b) => b.updatedAt - a.updatedAt);
}

export async function deleteStoryboardDraft(id: string): Promise<void> {
  const scope = await getDraftScope();
  const db = await getDB();
  await db.delete(STORE_NAME, storageId(scope, id));
}
