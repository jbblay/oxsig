'use client';

import { openDB, type DBSchema } from 'idb';
import type { StoryboardDraft } from './types';

const DB_NAME = 'oxsig-storyboards';
const DB_VERSION = 2;
const LEGACY_STORE_NAME = 'drafts';
const SCOPED_STORE_NAME = 'scoped-drafts';
const NAMESPACE_INDEX = 'by-namespace';
const SAVE_ATTEMPTS = 3;
const SAVE_RETRY_DELAYS_MS = [150, 450] as const;

/**
 * Server-backed drafts can always be reconstructed from the durable session,
 * so only a bounded number of those browser recovery copies are retained.
 * Local-only drafts are never auto-pruned: they may be the user's only copy.
 */
export const MAX_SERVER_BACKED_RECOVERY_DRAFTS = 12;

export const GUEST_STORYBOARD_DRAFT_NAMESPACE = 'guest' as const;

export type StoryboardDraftNamespace =
  | typeof GUEST_STORYBOARD_DRAFT_NAMESPACE
  | `account:${string}`;

export type StoryboardRecoveryStorageEstimate = {
  usage: number | null;
  quota: number | null;
  ratio: number | null;
};

export type StoryboardRecoveryStatus = {
  phase: 'idle' | 'saving' | 'saved' | 'error';
  namespace: StoryboardDraftNamespace | null;
  at: number;
  lastSavedAt?: number;
  attempt?: number;
  errorKind?: 'quota' | 'storage';
  message?: string;
  prunedDrafts?: number;
  storage?: StoryboardRecoveryStorageEstimate;
};

type ScopedStoryboardDraft = StoryboardDraft & {
  namespace: StoryboardDraftNamespace;
};

type FailedSave = {
  namespace: StoryboardDraftNamespace;
  draft: StoryboardDraft;
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

let recoveryStatus: StoryboardRecoveryStatus = {
  phase: 'idle',
  namespace: null,
  at: Date.now(),
};
let lastFailedSave: FailedSave | null = null;
const recoveryStatusListeners = new Set<(status: StoryboardRecoveryStatus) => void>();

export class StoryboardRecoveryError extends Error {
  readonly kind: 'quota' | 'storage';

  constructor(kind: 'quota' | 'storage', message: string, cause?: unknown) {
    super(message, { cause });
    this.name = 'StoryboardRecoveryError';
    this.kind = kind;
  }
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

function publishRecoveryStatus(next: Omit<StoryboardRecoveryStatus, 'at'> & { at?: number }) {
  recoveryStatus = {
    ...next,
    at: next.at ?? Date.now(),
    lastSavedAt: next.lastSavedAt ?? recoveryStatus.lastSavedAt,
  };
  for (const listener of recoveryStatusListeners) listener(recoveryStatus);
}

function isQuotaError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const value = error as { name?: unknown; message?: unknown };
  const name = typeof value.name === 'string' ? value.name : '';
  const message = typeof value.message === 'string' ? value.message : '';
  return name === 'QuotaExceededError' || /quota|storage.*full|disk.*full/i.test(message);
}

function delay(ms: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, ms));
}

async function pruneServerBackedRecoveryDrafts(
  namespace: StoryboardDraftNamespace,
  preserveId: string,
  limit = MAX_SERVER_BACKED_RECOVERY_DRAFTS
): Promise<number> {
  const db = await getDB();
  const records = await db.getAllFromIndex(SCOPED_STORE_NAME, NAMESPACE_INDEX, namespace);
  const protectedRecords = records
    .filter((record) => Boolean(record.serverId) && record.id !== preserveId)
    .sort((a, b) => b.updatedAt - a.updatedAt);
  const removable = protectedRecords.slice(Math.max(0, limit - 1));
  for (const record of removable) {
    await db.delete(SCOPED_STORE_NAME, [namespace, record.id]);
  }
  return removable.length;
}

export async function getStoryboardRecoveryStorageEstimate(): Promise<StoryboardRecoveryStorageEstimate> {
  if (typeof navigator === 'undefined' || !navigator.storage?.estimate) {
    return { usage: null, quota: null, ratio: null };
  }
  try {
    const estimate = await navigator.storage.estimate();
    const usage = typeof estimate.usage === 'number' ? estimate.usage : null;
    const quota = typeof estimate.quota === 'number' ? estimate.quota : null;
    const ratio = usage !== null && quota && quota > 0 ? usage / quota : null;
    return { usage, quota, ratio };
  } catch {
    return { usage: null, quota: null, ratio: null };
  }
}

export function getStoryboardRecoveryStatus(): StoryboardRecoveryStatus {
  return recoveryStatus;
}

export function subscribeStoryboardRecoveryStatus(
  listener: (status: StoryboardRecoveryStatus) => void
): () => void {
  recoveryStatusListeners.add(listener);
  return () => recoveryStatusListeners.delete(listener);
}

export function hasRetryableStoryboardRecoverySave(namespace: StoryboardDraftNamespace): boolean {
  return lastFailedSave?.namespace === namespace;
}

export async function retryLastStoryboardRecoverySave(
  namespace: StoryboardDraftNamespace
): Promise<boolean> {
  const failed = lastFailedSave;
  if (!failed || failed.namespace !== namespace) return false;
  await saveStoryboardDraft(failed.namespace, failed.draft);
  return true;
}

export async function saveStoryboardDraft(
  namespace: StoryboardDraftNamespace,
  draft: StoryboardDraft
): Promise<void> {
  let prunedDrafts = 0;
  let lastError: unknown;

  for (let attempt = 1; attempt <= SAVE_ATTEMPTS; attempt += 1) {
    publishRecoveryStatus({
      phase: 'saving',
      namespace,
      attempt,
      prunedDrafts,
    });

    try {
      const db = await getDB();
      await db.put(SCOPED_STORE_NAME, toScopedDraft(namespace, draft));
      prunedDrafts += await pruneServerBackedRecoveryDrafts(namespace, draft.id);
      lastFailedSave = null;
      const storage = await getStoryboardRecoveryStorageEstimate();
      publishRecoveryStatus({
        phase: 'saved',
        namespace,
        lastSavedAt: Date.now(),
        attempt,
        prunedDrafts,
        storage,
      });
      return;
    } catch (error) {
      lastError = error;
      const quota = isQuotaError(error);

      if (quota) {
        // Reclaim only drafts that already have a durable server copy. Never
        // auto-delete a local-only recovery draft merely to make room.
        try {
          const reclaimed = await pruneServerBackedRecoveryDrafts(namespace, draft.id, 0);
          prunedDrafts += reclaimed;
          if (reclaimed > 0 && attempt < SAVE_ATTEMPTS) continue;
        } catch {
          // The original quota failure remains the actionable error.
        }

        const storage = await getStoryboardRecoveryStorageEstimate();
        const message =
          'Browser storage is full. Secure or delete older recovery drafts, then retry.';
        lastFailedSave = { namespace, draft };
        publishRecoveryStatus({
          phase: 'error',
          namespace,
          attempt,
          errorKind: 'quota',
          message,
          prunedDrafts,
          storage,
        });
        throw new StoryboardRecoveryError('quota', message, error);
      }

      if (attempt < SAVE_ATTEMPTS) {
        await delay(SAVE_RETRY_DELAYS_MS[attempt - 1] ?? SAVE_RETRY_DELAYS_MS.at(-1) ?? 450);
        continue;
      }
    }
  }

  const storage = await getStoryboardRecoveryStorageEstimate();
  const message = 'Local Board recovery storage is temporarily unavailable.';
  lastFailedSave = { namespace, draft };
  publishRecoveryStatus({
    phase: 'error',
    namespace,
    attempt: SAVE_ATTEMPTS,
    errorKind: 'storage',
    message,
    prunedDrafts,
    storage,
  });
  throw new StoryboardRecoveryError('storage', message, lastError);
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
