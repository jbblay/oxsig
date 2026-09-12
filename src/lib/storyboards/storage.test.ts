import { beforeAll, describe, expect, it } from 'vitest';
import { deleteDB, openDB, type DBSchema } from 'idb';
import type { StoryboardDraft } from './types';
import {
  GUEST_STORYBOARD_DRAFT_NAMESPACE,
  deleteStoryboardDraft,
  getStoryboardDraft,
  listStoryboardDrafts,
  saveStoryboardDraft,
  storyboardDraftNamespaceForAccount,
} from './storage';

const DB_NAME = 'oxsig-storyboards';

interface LegacyStoryboardDB extends DBSchema {
  drafts: {
    key: string;
    value: StoryboardDraft;
    indexes: {
      'by-updated': number;
    };
  };
}

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

beforeAll(async () => {
  await deleteDB(DB_NAME);
  const legacyDb = await openDB<LegacyStoryboardDB>(DB_NAME, 1, {
    upgrade(db) {
      const store = db.createObjectStore('drafts', { keyPath: 'id' });
      store.createIndex('by-updated', 'updatedAt');
    },
  });
  await legacyDb.put('drafts', legacyDraft);
  legacyDb.close();
});

describe('Board recovery draft account isolation', () => {
  const accountA = storyboardDraftNamespaceForAccount('clerk-user-a');
  const accountB = storyboardDraftNamespaceForAccount('clerk-user-b');

  it('quarantines existing unscoped v1 drafts instead of assigning them to an account or guest', async () => {
    expect(await listStoryboardDrafts(accountA)).toEqual([]);
    expect(await listStoryboardDrafts(accountB)).toEqual([]);
    expect(await listStoryboardDrafts(GUEST_STORYBOARD_DRAFT_NAMESPACE)).toEqual([]);

    const upgradedDb = await openDB<LegacyStoryboardDB>(DB_NAME, 2);
    const preservedLegacyDraft = await upgradedDb.get('drafts', legacyDraft.id);
    upgradedDb.close();

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
