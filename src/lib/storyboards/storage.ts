'use client';

import { openDB, type DBSchema } from 'idb';
import type { StoryboardDraft } from './types';

const DB_NAME = 'oxsig-storyboards';
const DB_VERSION = 2;
const LEGACY_STORE_NAME = 'drafts';
const SCOPED_STORE_NAME = 'scoped-drafts';
const NAMESPACE_INDEX = 'by-namespace';

export const GUEST_STORYBOARD_DRAFT_NAMESPACE = 'guest' as const;

export type StoryboardDraftNamespace =
  | typeof GUEST_STORYBOARD_DRAFT_NAMESPACE
  | `account:${string}`;

type ScopedStoryboardDraft = StoryboardDraft & {
  namespace: StoryboardDraftNamespace;
};

interface StoryboardDB extends DBSchema {
  drafts: {
    key: string;
    value: StoryboardDraft;
    indexes: {
      'by-updated': number;
    };
  };
  'scoped-drafts': {
    key: [StoryboardDraftNamespace, string];
    value: ScopedStoryboardDraft;
    indexes: {
      'by-namespace': StoryboardDraftNamespace;
      'by-updated': number;
    };
  };
}

/**
 * Recovery drafts are browser-local and must always be addressed through an
 * explicit identity namespace. Account identifiers should be stable opaque
 * IDs (for example Clerk's session identity id), never an email or username.
 */
export function storyboardDraftNamespaceForAccount(accountId: string): StoryboardDraftNamespace {
  const normalized = accountId.trim();
  if (!normalized) throw new Error('A stable account id is required for Board recovery storage.');
  return `account:${normalized}`;
}

async function getDB() {
  return openDB<StoryboardDB>(DB_NAME, DB_VERSION, {
    upgrade(db, oldVersion) {
      // Keep the version-one store intact. Its records predate account scoping,
      // so assigning them to either a signed-in account or guest would be a
      // guess. They remain quarantined instead of being silently claimed.
      if (oldVersion < 1 && !db.objectStoreNames.contains(LEGACY_STORE_NAME)) {
        const legacyStore = db.createObjectStore(LEGACY_STORE_NAME, { keyPath: 'id' });
        legacyStore.createIndex('by-updated', 'updatedAt');
      }

      if (!db.objectStoreNames.contains(SCOPED_STORE_NAME)) {
        const scopedStore = db.createObjectStore(SCOPED_STORE_NAME, {
          keyPath: ['namespace', 'id'],
        });
        scopedStore.createIndex(NAMESPACE_INDEX, 'namespace');
        scopedStore.createIndex('by-updated', 'updatedAt');
      }
    },
  });
}

function toScopedDraft(
  namespace: StoryboardDraftNamespace,
  draft: StoryboardDraft
): ScopedStoryboardDraft {
  return { ...draft, namespace };
}

function fromScopedDraft(record: ScopedStoryboardDraft): StoryboardDraft {
  const { namespace: _namespace, ...draft } = record;
  return draft;
}

export async function saveStoryboardDraft(
  namespace: StoryboardDraftNamespace,
  draft: StoryboardDraft
): Promise<void> {
  const db = await getDB();
  await db.put(SCOPED_STORE_NAME, toScopedDraft(namespace, draft));
}

export async function getStoryboardDraft(
  namespace: StoryboardDraftNamespace,
  id: string
): Promise<StoryboardDraft | undefined> {
  const db = await getDB();
  const record = await db.get(SCOPED_STORE_NAME, [namespace, id]);
  return record ? fromScopedDraft(record) : undefined;
}

export async function listStoryboardDrafts(
  namespace: StoryboardDraftNamespace
): Promise<StoryboardDraft[]> {
  const db = await getDB();
  const records = await db.getAllFromIndex(SCOPED_STORE_NAME, NAMESPACE_INDEX, namespace);
  return records
    .map(fromScopedDraft)
    .sort((a, b) => b.updatedAt - a.updatedAt);
}

export async function deleteStoryboardDraft(
  namespace: StoryboardDraftNamespace,
  id: string
): Promise<void> {
  const db = await getDB();
  await db.delete(SCOPED_STORE_NAME, [namespace, id]);
}
