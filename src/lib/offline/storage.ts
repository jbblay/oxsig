/**
 * Offline Storage with IndexedDB
 * 
 * Encrypted local storage for documents, signatures, and offline operations.
 * Uses IndexedDB for structured data with optional encryption.
 */

import { sha256 } from '@noble/hashes/sha256';
import { bytesToHex, hexToBytes } from '@noble/hashes/utils';

const DB_NAME = 'oxsig-offline';
const DB_VERSION = 1;

// Store names
export const STORES = {
  DOCUMENTS: 'documents',
  SIGNATURES: 'signatures',
  QUEUE: 'offline-queue',
  METADATA: 'metadata',
} as const;

/**
 * Initialize IndexedDB database
 */
export function initDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;

      // Documents store
      if (!db.objectStoreNames.contains(STORES.DOCUMENTS)) {
        const docStore = db.createObjectStore(STORES.DOCUMENTS, { keyPath: 'id' });
        docStore.createIndex('ownerId', 'ownerId', { unique: false });
        docStore.createIndex('status', 'status', { unique: false });
        docStore.createIndex('updatedAt', 'updatedAt', { unique: false });
        docStore.createIndex('encrypted', 'encrypted', { unique: false });
      }

      // Signatures store
      if (!db.objectStoreNames.contains(STORES.SIGNATURES)) {
        const sigStore = db.createObjectStore(STORES.SIGNATURES, { keyPath: 'id' });
        sigStore.createIndex('documentId', 'documentId', { unique: false });
        sigStore.createIndex('signerId', 'signerId', { unique: false });
        sigStore.createIndex('timestamp', 'timestamp', { unique: false });
      }

      // Offline operation queue
      if (!db.objectStoreNames.contains(STORES.QUEUE)) {
        const queueStore = db.createObjectStore(STORES.QUEUE, { 
          keyPath: 'id',
          autoIncrement: true 
        });
        queueStore.createIndex('timestamp', 'timestamp', { unique: false });
        queueStore.createIndex('type', 'type', { unique: false });
        queueStore.createIndex('status', 'status', { unique: false });
      }

      // Metadata store
      if (!db.objectStoreNames.contains(STORES.METADATA)) {
        db.createObjectStore(STORES.METADATA, { keyPath: 'key' });
      }

      console.log('✅ IndexedDB initialized with stores:', Object.values(STORES));
    };
  });
}

/**
 * Generic get operation
 */
export async function getItem<T>(store: string, key: string): Promise<T | null> {
  const db = await initDB();
  
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(store, 'readonly');
    const objectStore = transaction.objectStore(store);
    const request = objectStore.get(key);

    request.onsuccess = () => resolve(request.result || null);
    request.onerror = () => reject(request.error);
  });
}

/**
 * Generic put operation
 */
export async function setItem<T>(store: string, value: T): Promise<void> {
  const db = await initDB();
  
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(store, 'readwrite');
    const objectStore = transaction.objectStore(store);
    const request = objectStore.put(value);

    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

/**
 * Generic delete operation
 */
export async function deleteItem(store: string, key: string): Promise<void> {
  const db = await initDB();
  
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(store, 'readwrite');
    const objectStore = transaction.objectStore(store);
    const request = objectStore.delete(key);

    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

/**
 * Get all items from store
 */
export async function getAllItems<T>(store: string): Promise<T[]> {
  const db = await initDB();
  
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(store, 'readonly');
    const objectStore = transaction.objectStore(store);
    const request = objectStore.getAll();

    request.onsuccess = () => resolve(request.result || []);
    request.onerror = () => reject(request.error);
  });
}

/**
 * Query items by index
 */
export async function queryByIndex<T>(
  store: string,
  indexName: string,
  value: string | number
): Promise<T[]> {
  const db = await initDB();
  
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(store, 'readonly');
    const objectStore = transaction.objectStore(store);
    const index = objectStore.index(indexName);
    const request = index.getAll(value);

    request.onsuccess = () => resolve(request.result || []);
    request.onerror = () => reject(request.error);
  });
}

/**
 * Clear entire store
 */
export async function clearStore(store: string): Promise<void> {
  const db = await initDB();
  
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(store, 'readwrite');
    const objectStore = transaction.objectStore(store);
    const request = objectStore.clear();

    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

/**
 * Hash data for integrity checking
 */
export function hashData(data: any): string {
  const dataStr = JSON.stringify(data);
  const hash = sha256(new TextEncoder().encode(dataStr));
  return bytesToHex(hash);
}

/**
 * Verify data integrity
 */
export function verifyDataIntegrity(data: any, expectedHash: string): boolean {
  const actualHash = hashData(data);
  return actualHash === expectedHash;
}

/**
 * Document-specific operations
 */
export const DocumentStorage = {
  async save(document: any): Promise<void> {
    const docWithHash = {
      ...document,
      _hash: hashData(document),
      _savedAt: Date.now(),
    };
    await setItem(STORES.DOCUMENTS, docWithHash);
  },

  async get(id: string): Promise<any | null> {
    return getItem(STORES.DOCUMENTS, id);
  },

  async getAll(): Promise<any[]> {
    return getAllItems(STORES.DOCUMENTS);
  },

  async getByOwner(ownerId: string): Promise<any[]> {
    return queryByIndex(STORES.DOCUMENTS, 'ownerId', ownerId);
  },

  async delete(id: string): Promise<void> {
    await deleteItem(STORES.DOCUMENTS, id);
  },

  async clear(): Promise<void> {
    await clearStore(STORES.DOCUMENTS);
  },
};

/**
 * Signature-specific operations
 */
export const SignatureStorage = {
  async save(signature: any): Promise<void> {
    const sigWithHash = {
      ...signature,
      _hash: hashData(signature),
      _savedAt: Date.now(),
    };
    await setItem(STORES.SIGNATURES, sigWithHash);
  },

  async get(id: string): Promise<any | null> {
    return getItem(STORES.SIGNATURES, id);
  },

  async getAll(): Promise<any[]> {
    return getAllItems(STORES.SIGNATURES);
  },

  async getByDocument(documentId: string): Promise<any[]> {
    return queryByIndex(STORES.SIGNATURES, 'documentId', documentId);
  },

  async delete(id: string): Promise<void> {
    await deleteItem(STORES.SIGNATURES, id);
  },

  async clear(): Promise<void> {
    await clearStore(STORES.SIGNATURES);
  },
};

/**
 * Metadata operations
 */
export const MetadataStorage = {
  async set(key: string, value: any): Promise<void> {
    await setItem(STORES.METADATA, { key, value, updatedAt: Date.now() });
  },

  async get(key: string): Promise<any | null> {
    const result = await getItem<{ key: string; value: any }>(STORES.METADATA, key);
    return result?.value || null;
  },

  async delete(key: string): Promise<void> {
    await deleteItem(STORES.METADATA, key);
  },
};

/**
 * Get storage usage statistics
 */
export async function getStorageStats(): Promise<{
  documents: number;
  signatures: number;
  queuedOperations: number;
  estimatedSize: number;
}> {
  const [documents, signatures, queue] = await Promise.all([
    getAllItems(STORES.DOCUMENTS),
    getAllItems(STORES.SIGNATURES),
    getAllItems(STORES.QUEUE),
  ]);

  // Estimate size (rough calculation)
  const estimatedSize = 
    JSON.stringify(documents).length +
    JSON.stringify(signatures).length +
    JSON.stringify(queue).length;

  return {
    documents: documents.length,
    signatures: signatures.length,
    queuedOperations: queue.length,
    estimatedSize,
  };
}
