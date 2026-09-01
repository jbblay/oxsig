'use client';

import { openDB, type DBSchema } from 'idb';
import type { StoryboardDraft } from './types';

const DB_NAME = 'oxsig-storyboards';
const DB_VERSION = 1;
const STORE_NAME = 'drafts';

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

export async function saveStoryboardDraft(draft: StoryboardDraft): Promise<void> {
  const db = await getDB();
  await db.put(STORE_NAME, draft);
}

export async function getStoryboardDraft(id: string): Promise<StoryboardDraft | undefined> {
  const db = await getDB();
  return db.get(STORE_NAME, id);
}

export async function listStoryboardDrafts(): Promise<StoryboardDraft[]> {
  const db = await getDB();
  const drafts = await db.getAll(STORE_NAME);
  return drafts.sort((a, b) => b.updatedAt - a.updatedAt);
}

export async function deleteStoryboardDraft(id: string): Promise<void> {
  const db = await getDB();
  await db.delete(STORE_NAME, id);
}
