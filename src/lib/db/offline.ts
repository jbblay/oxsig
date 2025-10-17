/**
 * Offline-First Database using IndexedDB
 * Stores documents, signatures, and settings locally with automatic sync
 */

const DB_NAME = 'oxsig-db';
const DB_VERSION = 1;

export interface StoredDocument {
  id: string;
  hash: string;
  name: string;
  content: string;
  signatures: any[];
  synced: boolean;
  timestamp: number;
  metadata?: Record<string, any>;
}

export interface StoredSignature {
  id: string;
  documentId: string;
  signature: string;
  signer: string;
  timestamp: number;
  synced: boolean;
}

export interface StoredSettings {
  key: string;
  value: any;
  timestamp: number;
}

class OfflineDB {
  private db: IDBDatabase | null = null;

  /**
   * Initialize database
   */
  async init(): Promise<void> {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        this.db = request.result;
        resolve();
      };

      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;

        // Documents store
        if (!db.objectStoreNames.contains('documents')) {
          const documentsStore = db.createObjectStore('documents', { keyPath: 'id' });
          documentsStore.createIndex('synced', 'synced', { unique: false });
          documentsStore.createIndex('timestamp', 'timestamp', { unique: false });
          documentsStore.createIndex('hash', 'hash', { unique: false });
        }

        // Signatures store
        if (!db.objectStoreNames.contains('signatures')) {
          const signaturesStore = db.createObjectStore('signatures', { keyPath: 'id' });
          signaturesStore.createIndex('documentId', 'documentId', { unique: false });
          signaturesStore.createIndex('synced', 'synced', { unique: false });
          signaturesStore.createIndex('timestamp', 'timestamp', { unique: false });
        }

        // Settings store
        if (!db.objectStoreNames.contains('settings')) {
          db.createObjectStore('settings', { keyPath: 'key' });
        }

        // Activity log
        if (!db.objectStoreNames.contains('activity')) {
          const activityStore = db.createObjectStore('activity', { keyPath: 'id', autoIncrement: true });
          activityStore.createIndex('timestamp', 'timestamp', { unique: false });
          activityStore.createIndex('type', 'type', { unique: false });
        }
      };
    });
  }

  /**
   * Save document
   */
  async saveDocument(doc: StoredDocument): Promise<string> {
    if (!this.db) await this.init();

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction(['documents'], 'readwrite');
      const store = transaction.objectStore('documents');
      const request = store.put(doc);

      request.onsuccess = () => resolve(doc.id);
      request.onerror = () => reject(request.error);
    });
  }

  /**
   * Get document by ID
   */
  async getDocument(id: string): Promise<StoredDocument | null> {
    if (!this.db) await this.init();

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction(['documents'], 'readonly');
      const store = transaction.objectStore('documents');
      const request = store.get(id);

      request.onsuccess = () => resolve(request.result || null);
      request.onerror = () => reject(request.error);
    });
  }

  /**
   * Get all documents
   */
  async getAllDocuments(): Promise<StoredDocument[]> {
    if (!this.db) await this.init();

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction(['documents'], 'readonly');
      const store = transaction.objectStore('documents');
      const request = store.getAll();

      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  /**
   * Get unsynced documents
   */
  async getUnsyncedDocuments(): Promise<StoredDocument[]> {
    if (!this.db) await this.init();

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction(['documents'], 'readonly');
      const store = transaction.objectStore('documents');
      const index = store.index('synced');
      const request = index.getAll(IDBKeyRange.only(false));

      request.onsuccess = () => resolve(request.result || []);
      request.onerror = () => reject(request.error);
    });
  }

  /**
   * Mark document as synced
   */
  async markDocumentSynced(id: string): Promise<void> {
    if (!this.db) await this.init();

    const doc = await this.getDocument(id);
    if (!doc) throw new Error('Document not found');

    doc.synced = true;
    await this.saveDocument(doc);
  }

  /**
   * Delete document
   */
  async deleteDocument(id: string): Promise<void> {
    if (!this.db) await this.init();

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction(['documents'], 'readwrite');
      const store = transaction.objectStore('documents');
      const request = store.delete(id);

      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  /**
   * Save signature
   */
  async saveSignature(sig: StoredSignature): Promise<string> {
    if (!this.db) await this.init();

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction(['signatures'], 'readwrite');
      const store = transaction.objectStore('signatures');
      const request = store.put(sig);

      request.onsuccess = () => resolve(sig.id);
      request.onerror = () => reject(request.error);
    });
  }

  /**
   * Get signatures for document
   */
  async getSignaturesForDocument(documentId: string): Promise<StoredSignature[]> {
    if (!this.db) await this.init();

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction(['signatures'], 'readonly');
      const store = transaction.objectStore('signatures');
      const index = store.index('documentId');
      const request = index.getAll(documentId);

      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  /**
   * Save setting
   */
  async saveSetting(key: string, value: any): Promise<void> {
    if (!this.db) await this.init();

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction(['settings'], 'readwrite');
      const store = transaction.objectStore('settings');
      const request = store.put({ key, value, timestamp: Date.now() });

      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  /**
   * Get setting
   */
  async getSetting(key: string): Promise<any> {
    if (!this.db) await this.init();

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction(['settings'], 'readonly');
      const store = transaction.objectStore('settings');
      const request = store.get(key);

      request.onsuccess = () => resolve(request.result?.value);
      request.onerror = () => reject(request.error);
    });
  }

  /**
   * Log activity
   */
  async logActivity(type: string, data: any): Promise<void> {
    if (!this.db) await this.init();

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction(['activity'], 'readwrite');
      const store = transaction.objectStore('activity');
      const request = store.add({
        type,
        data,
        timestamp: Date.now(),
      });

      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  /**
   * Get recent activity
   */
  async getRecentActivity(limit: number = 50): Promise<any[]> {
    if (!this.db) await this.init();

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction(['activity'], 'readonly');
      const store = transaction.objectStore('activity');
      const index = store.index('timestamp');
      const request = index.openCursor(null, 'prev');
      
      const results: any[] = [];
      request.onsuccess = () => {
        const cursor = request.result;
        if (cursor && results.length < limit) {
          results.push(cursor.value);
          cursor.continue();
        } else {
          resolve(results);
        }
      };
      request.onerror = () => reject(request.error);
    });
  }

  /**
   * Clear all data
   */
  async clearAll(): Promise<void> {
    if (!this.db) await this.init();

    const stores = ['documents', 'signatures', 'settings', 'activity'];
    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction(stores, 'readwrite');
      
      stores.forEach(storeName => {
        transaction.objectStore(storeName).clear();
      });

      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
    });
  }

  /**
   * Export all data
   */
  async exportData(): Promise<{
    documents: StoredDocument[];
    signatures: StoredSignature[];
    settings: StoredSettings[];
  }> {
    if (!this.db) await this.init();

    const documents = await this.getAllDocuments();
    const signatures: StoredSignature[] = await new Promise((resolve, reject) => {
      const transaction = this.db!.transaction(['signatures'], 'readonly');
      const request = transaction.objectStore('signatures').getAll();
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    const settings: StoredSettings[] = await new Promise((resolve, reject) => {
      const transaction = this.db!.transaction(['settings'], 'readonly');
      const request = transaction.objectStore('settings').getAll();
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });

    return { documents, signatures, settings };
  }
}

// Singleton instance
export const offlineDB = new OfflineDB();

/**
 * Sync manager for background synchronization
 */
export class SyncManager {
  private syncInProgress = false;

  /**
   * Sync all unsynced data
   */
  async syncAll(): Promise<{ synced: number; failed: number }> {
    if (this.syncInProgress) {
      console.log('Sync already in progress');
      return { synced: 0, failed: 0 };
    }

    if (!navigator.onLine) {
      console.log('Device is offline, skipping sync');
      return { synced: 0, failed: 0 };
    }

    this.syncInProgress = true;
    let synced = 0;
    let failed = 0;

    try {
      const unsyncedDocs = await offlineDB.getUnsyncedDocuments();

      for (const doc of unsyncedDocs) {
        try {
          // Simulate API call (replace with actual API endpoint)
          await this.syncDocument(doc);
          await offlineDB.markDocumentSynced(doc.id);
          synced++;
        } catch (error) {
          console.error('Failed to sync document:', doc.id, error);
          failed++;
        }
      }
    } finally {
      this.syncInProgress = false;
    }

    return { synced, failed };
  }

  /**
   * Sync single document (stub - implement with your API)
   */
  private async syncDocument(doc: StoredDocument): Promise<void> {
    // TODO: Replace with actual API call
    console.log('Syncing document:', doc.id);
    
    // Simulate network delay
    await new Promise(resolve => setTimeout(resolve, 100));
    
    // In production, call your backend:
    // await fetch('/api/documents/sync', {
    //   method: 'POST',
    //   headers: { 'Content-Type': 'application/json' },
    //   body: JSON.stringify(doc)
    // });
  }

  /**
   * Start periodic sync
   */
  startPeriodicSync(intervalMs: number = 60000): void {
    setInterval(() => {
      if (navigator.onLine) {
        this.syncAll().then(result => {
          if (result.synced > 0) {
            console.log(`Synced ${result.synced} documents`);
          }
          if (result.failed > 0) {
            console.warn(`Failed to sync ${result.failed} documents`);
          }
        });
      }
    }, intervalMs);
  }
}

export const syncManager = new SyncManager();
