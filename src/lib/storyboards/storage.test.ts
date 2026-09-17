import { beforeAll, describe, expect, it, vi } from 'vitest';
import type { StoryboardDraft } from './types';

const fakeIdb = vi.hoisted(() => {
  type StoreState = {
    keyPath: string | string[];
    records: Map<string, unknown>;
    indexes: Set<string>;
  };
  type DatabaseState = {
    version: number;
    stores: Map<string, StoreState>;
  };

  const databases = new Map<string, DatabaseState>();
  const putFailures: unknown[] = [];
  const encodeKey = (key: unknown) => JSON.stringify(key);

  const recordKey = (store: StoreState, value: Record<string, unknown>) => {
    const key = Array.isArray(store.keyPath)
      ? store.keyPath.map((field) => value[field])
      : value[store.keyPath];
    return encodeKey(key);
  };

  const getDatabase = (name: string) => {
    let database = databases.get(name);
    if (!database) {
      database = { version: 0, stores: new Map() };
      databases.set(name, database);
    }
    return database;
  };

  const makeConnection = (database: DatabaseState) => ({
    objectStoreNames: {
      contains(storeName: string) {
        return database.stores.has(storeName);
      },
    },
    createObjectStore(storeName: string, options: { keyPath: string | string[] }) {
      const store: StoreState = {
        keyPath: options.keyPath,
        records: new Map(),
        indexes: new Set(),
      };
      database.stores.set(storeName, store);
      return {
        createIndex(indexName: string) {
          store.indexes.add(indexName);
        },
      };
    },
    async put(storeName: string, value: Record<string, unknown>) {
      if (putFailures.length > 0) throw putFailures.shift();
      const store = database.stores.get(storeName);
      if (!store) throw new Error(`Unknown fake IndexedDB store: ${storeName}`);
      store.records.set(recordKey(store, value), value);
    },
    async get(storeName: string, key: unknown) {
      const store = database.stores.get(storeName);
      if (!store) return undefined;
      return store.records.get(encodeKey(key));
    },
    async getAllFromIndex(storeName: string, indexName: string, value: unknown) {
      const store = database.stores.get(storeName);
      if (!store) return [];
      if (!store.indexes.has(indexName)) throw new Error(`Unknown fake IndexedDB index: ${indexName}`);
      const records = Array.from(store.records.values()) as Array<Record<string, unknown>>;
      if (indexName === 'by-namespace') {
        return records.filter((record) => record.namespace === value);
      }
      if (indexName === 'by-updated') {
        return records.filter((record) => record.updatedAt === value);
      }
      return [];
    },
    async delete(storeName: string, key: unknown) {
      database.stores.get(storeName)?.records.delete(encodeKey(key));
    },
    close() {},
  });

  return {
    async openDB(
      name: string,
      version: number,
      options?: {
        upgrade?: (db: ReturnType<typeof makeConnection>, oldVersion: number, newVersion: number) => void;
      }
    ) {
      const database = getDatabase(name);
      const connection = makeConnection(database);
      if (version > database.version) {
        const oldVersion = database.version;
        options?.upgrade?.(connection, oldVersion, version);
        database.version = version;
      }
      return connection;
    },
    reset() {
      databases.clear();
      putFailures.length = 0;
    },
    failNextPuts(...errors: unknown[]) {
      putFailures.push(...errors);
    },
    seed(
      databaseName: string,
      version: number,
      storeName: string,
      keyPath: string | string[],
      value: Record<string, unknown>
    ) {
      const database = getDatabase(databaseName);
      database.version = version;
      let store = database.stores.get(storeName);
      if (!store) {
        store = { keyPath, records: new Map(), indexes: new Set(['by-updated']) };
        database.stores.set(storeName, store);
      }
      store.records.set(recordKey(store, value), value);
    },
    read(databaseName: string, storeName: string, key: unknown) {
      return databases.get(databaseName)?.stores.get(storeName)?.records.get(encodeKey(key));
    },
  };
});

vi.mock('idb', () => ({ openDB: fakeIdb.openDB }));

import {
  GUEST_STORYBOARD_DRAFT_NAMESPACE,
  MAX_SERVER_BACKED_RECOVERY_DRAFTS,
  StoryboardRecoveryError,
  deleteStoryboardDraft,
  getStoryboardDraft,
  getStoryboardRecoveryStatus,
  listStoryboardDrafts,
  saveStoryboardDraft,
  storyboardDraftNamespaceForAccount,
} from './storage';

const DB_NAME = 'oxsig-storyboards';

function makeDraft(
  id: string,
  title: string,
  overrides: Partial<StoryboardDraft> = {}
): StoryboardDraft {
  const now = Date.now();
  return {
    version: 1,
    id,
    title,
    createdAt: now,
    updatedAt: now,
    durationMs: 1000,
    events: [],
    status: 'local-draft',
    ...overrides,
  };
}

const legacyDraft = makeDraft('legacy-unscoped', 'Legacy unscoped draft', {
  audio: new Blob(['legacy-audio'], { type: 'audio/webm' }),
  audioMimeType: 'audio/webm',
});

beforeAll(() => {
  fakeIdb.reset();
  fakeIdb.seed(DB_NAME, 1, 'drafts', 'id', legacyDraft as unknown as Record<string, unknown>);
});

describe('Board recovery draft account isolation', () => {
  const accountA = storyboardDraftNamespaceForAccount('clerk-user-a');
  const accountB = storyboardDraftNamespaceForAccount('clerk-user-b');

  it('quarantines existing unscoped v1 drafts instead of assigning them to an account or guest', async () => {
    expect(await listStoryboardDrafts(accountA)).toEqual([]);
    expect(await listStoryboardDrafts(accountB)).toEqual([]);
    expect(await listStoryboardDrafts(GUEST_STORYBOARD_DRAFT_NAMESPACE)).toEqual([]);

    const preservedLegacyDraft = fakeIdb.read(
      DB_NAME,
      'drafts',
      legacyDraft.id
    ) as StoryboardDraft | undefined;

    expect(preservedLegacyDraft?.title).toBe(legacyDraft.title);
    expect(preservedLegacyDraft?.audio).toBeInstanceOf(Blob);
    expect(await preservedLegacyDraft?.audio?.text()).toBe('legacy-audio');
  });

  it('isolates the same draft id across account A, account B, and guest, including audio', async () => {
    const accountADraft = makeDraft('shared-id', 'Account A recovery', {
      audio: new Blob(['account-a-audio'], { type: 'audio/webm' }),
      audioMimeType: 'audio/webm',
      updatedAt: 30,
    });
    const accountBDraft = makeDraft('shared-id', 'Account B recovery', { updatedAt: 20 });
    const guestDraft = makeDraft('shared-id', 'Guest recovery', { updatedAt: 10 });

    await saveStoryboardDraft(accountA, accountADraft);
    await saveStoryboardDraft(accountB, accountBDraft);
    await saveStoryboardDraft(GUEST_STORYBOARD_DRAFT_NAMESPACE, guestDraft);

    expect((await listStoryboardDrafts(accountA)).map((draft) => draft.title)).toEqual([
      'Account A recovery',
    ]);
    expect((await listStoryboardDrafts(accountB)).map((draft) => draft.title)).toEqual([
      'Account B recovery',
    ]);
    expect(
      (await listStoryboardDrafts(GUEST_STORYBOARD_DRAFT_NAMESPACE)).map((draft) => draft.title)
    ).toEqual(['Guest recovery']);

    const restoredA = await getStoryboardDraft(accountA, accountADraft.id);
    const restoredB = await getStoryboardDraft(accountB, accountBDraft.id);
    expect(restoredA?.audio).toBeInstanceOf(Blob);
    expect(await restoredA?.audio?.text()).toBe('account-a-audio');
    expect(restoredB?.audio).toBeUndefined();
  });

  it('keeps a delayed save in the namespace captured before an account switch', async () => {
    const delayedDraft = makeDraft('pending-save', 'Captured under account A');
    const capturedNamespace = accountA;
    let releaseSave!: () => void;
    const gate = new Promise<void>((resolve) => {
      releaseSave = resolve;
    });

    const pendingSave = (async () => {
      await gate;
      await saveStoryboardDraft(capturedNamespace, delayedDraft);
    })();

    const currentNamespace = accountB;
    releaseSave();
    await pendingSave;

    expect((await getStoryboardDraft(accountA, delayedDraft.id))?.title).toBe(delayedDraft.title);
    expect(await getStoryboardDraft(currentNamespace, delayedDraft.id)).toBeUndefined();
  });

  it('deletes only inside the requested namespace', async () => {
    await deleteStoryboardDraft(accountB, 'shared-id');

    expect(await getStoryboardDraft(accountB, 'shared-id')).toBeUndefined();
    expect((await getStoryboardDraft(accountA, 'shared-id'))?.title).toBe('Account A recovery');
    expect(
      (await getStoryboardDraft(GUEST_STORYBOARD_DRAFT_NAMESPACE, 'shared-id'))?.title
    ).toBe('Guest recovery');
  });

  it('rejects empty account identifiers instead of falling back to guest', () => {
    expect(() => storyboardDraftNamespaceForAccount('   ')).toThrow(/stable account id/i);
  });
});

describe('Board recovery reliability', () => {
  it('retries a transient IndexedDB write before reporting success', async () => {
    const namespace = storyboardDraftNamespaceForAccount('retry-user');
    const draft = makeDraft('retry-draft', 'Retry me');
    fakeIdb.failNextPuts(new Error('temporary IndexedDB failure'));

    await saveStoryboardDraft(namespace, draft);

    expect((await getStoryboardDraft(namespace, draft.id))?.title).toBe('Retry me');
    expect(getStoryboardRecoveryStatus()).toMatchObject({
      phase: 'saved',
      namespace,
      attempt: 2,
    });
  });

  it('bounds automatic pruning to server-backed recovery copies and preserves local-only work', async () => {
    const namespace = storyboardDraftNamespaceForAccount('retention-user');
    const localOnly = [
      makeDraft('local-only-a', 'Only local A', { updatedAt: 1 }),
      makeDraft('local-only-b', 'Only local B', { updatedAt: 2 }),
    ];
    for (const draft of localOnly) await saveStoryboardDraft(namespace, draft);

    for (let index = 0; index < MAX_SERVER_BACKED_RECOVERY_DRAFTS + 3; index += 1) {
      await saveStoryboardDraft(
        namespace,
        makeDraft(`secured-${index}`, `Secured ${index}`, {
          updatedAt: 100 + index,
          serverId: `server-${index}`,
          serverPermission: 'owner',
        })
      );
    }

    const stored = await listStoryboardDrafts(namespace);
    const secured = stored.filter((draft) => draft.serverId);
    expect(secured).toHaveLength(MAX_SERVER_BACKED_RECOVERY_DRAFTS);
    expect(stored.map((draft) => draft.id)).toEqual(
      expect.arrayContaining(localOnly.map((draft) => draft.id))
    );
  });

  it('classifies quota exhaustion and keeps a retryable failure instead of pretending the save is idle', async () => {
    const namespace = storyboardDraftNamespaceForAccount('quota-user');
    const quotaError = Object.assign(new Error('browser quota full'), {
      name: 'QuotaExceededError',
    });
    fakeIdb.failNextPuts(quotaError);

    await expect(saveStoryboardDraft(namespace, makeDraft('quota-draft', 'Quota draft'))).rejects.toEqual(
      expect.objectContaining({
        name: 'StoryboardRecoveryError',
        kind: 'quota',
      } satisfies Partial<StoryboardRecoveryError>)
    );
    expect(getStoryboardRecoveryStatus()).toMatchObject({
      phase: 'error',
      namespace,
      errorKind: 'quota',
    });
  });
});
