/**
 * Background Sync Service - IndexedDB ↔ PostgreSQL synchronization
 */

import { offlineDB } from './offline';
import { documents } from '@/lib/api';
import type { StoredDocument } from './offline';

export interface SyncStatus {
  inProgress: boolean;
  lastSync: Date | null;
  pendingChanges: number;
  errors: string[];
}

export class BackgroundSync {
  private db = offlineDB;
  private syncInterval: NodeJS.Timeout | null = null;
  private isSyncing = false;
  private lastSync: Date | null = null;
  private errors: string[] = [];

  constructor() {
    // Using the imported offlineDB instance
  }

  /**
   * Start automatic background sync
   */
  start(intervalMs: number = 60000): void {
    if (this.syncInterval) {
      console.log('[BackgroundSync] Already running');
      return;
    }

    console.log(`[BackgroundSync] Starting (interval: ${intervalMs}ms)`);

    // Initial sync
    this.sync();

    // Periodic sync
    this.syncInterval = setInterval(() => {
      this.sync();
    }, intervalMs);

    // Sync on network reconnect
    if (typeof window !== 'undefined') {
      window.addEventListener('online', () => {
        console.log('[BackgroundSync] Network reconnected - syncing');
        this.sync();
      });
    }
  }

  /**
   * Stop background sync
   */
  stop(): void {
    if (this.syncInterval) {
      clearInterval(this.syncInterval);
      this.syncInterval = null;
      console.log('[BackgroundSync] Stopped');
    }
  }

  /**
   * Manual sync trigger
   */
  async sync(): Promise<void> {
    if (this.isSyncing) {
      console.log('[BackgroundSync] Sync already in progress');
      return;
    }

    if (!navigator.onLine) {
      console.log('[BackgroundSync] Offline - skipping sync');
      return;
    }

    this.isSyncing = true;
    this.errors = [];

    try {
      console.log('[BackgroundSync] Starting sync...');

      // Get unsynced documents
      const unsyncedDocs = await this.getUnsyncedDocuments();
      console.log(`[BackgroundSync] Found ${unsyncedDocs.length} unsynced documents`);

      // Sync each document
      for (const doc of unsyncedDocs) {
        try {
          await this.syncDocument(doc);
        } catch (error) {
          const errorMsg = `Failed to sync document ${doc.id}: ${String(error)}`;
          console.error('[BackgroundSync]', errorMsg);
          this.errors.push(errorMsg);
        }
      }

      // Pull remote changes
      await this.pullRemoteChanges();

      this.lastSync = new Date();
      console.log('[BackgroundSync] Sync completed');
    } catch (error) {
      const errorMsg = `Sync failed: ${String(error)}`;
      console.error('[BackgroundSync]', errorMsg);
      this.errors.push(errorMsg);
    } finally {
      this.isSyncing = false;
    }
  }

  /**
   * Get sync status
   */
  async getStatus(): Promise<SyncStatus> {
    const unsyncedDocs = await this.getUnsyncedDocuments();

    return {
      inProgress: this.isSyncing,
      lastSync: this.lastSync,
      pendingChanges: unsyncedDocs.length,
      errors: [...this.errors],
    };
  }

  // ============================================================================
  // Private Methods
  // ============================================================================

  private async getUnsyncedDocuments(): Promise<StoredDocument[]> {
    await this.db.init();
    const allDocs = await this.db.getAllDocuments();
    return allDocs.filter((doc) => !doc.synced);
  }

  private async syncDocument(doc: StoredDocument): Promise<void> {
    // Check if document is temporary (never synced)
    const isNew = doc.id.startsWith('temp-') || doc.id.startsWith('local-');

    if (isNew) {
      // Create on backend
      const created = await documents.create({
        title: doc.title || doc.name || 'Untitled',
        content: doc.content,
        contentType: (doc.contentType as 'pdf' | 'markdown' | 'html' | 'text' | undefined) || 'text',
        tags: doc.tags || [],
        metadata: doc.metadata || {},
        status: 'draft',
      });

      // Update local document with server ID
      await this.db.deleteDocument(doc.id);
      await this.db.saveDocument({
        ...doc,
        id: created.id,
        synced: true,
        lastModified: new Date(),
      });

      console.log(`[BackgroundSync] Created document: ${doc.title || doc.name} (${created.id})`);
    } else {
      // Update existing on backend
      await documents.update(doc.id, {
        title: doc.title || doc.name || 'Untitled',
        content: doc.content,
        tags: doc.tags || [],
        metadata: doc.metadata || {},
      });

      // Mark as synced
      await this.db.saveDocument({
        ...doc,
        synced: true,
        lastModified: new Date(),
      });

      console.log(`[BackgroundSync] Updated document: ${doc.title || doc.name} (${doc.id})`);
    }
  }

  private async pullRemoteChanges(): Promise<void> {
    try {
      // Get recent documents from backend
      const response = await documents.list({
        sortBy: 'updatedAt',
        sortOrder: 'desc',
        pageSize: 50,
      });

      // Update local cache
      for (const remoteDoc of response.data) {
        const localDoc = await this.db.getDocument(remoteDoc.id);

        if (!localDoc) {
          // New document - add to local
          await this.db.saveDocument({
            id: remoteDoc.id,
            title: remoteDoc.title,
            content: remoteDoc.content,
            contentType: remoteDoc.contentType,
            tags: remoteDoc.tags,
            metadata: remoteDoc.metadata,
            synced: true,
            createdAt: new Date(remoteDoc.createdAt),
            lastModified: new Date(remoteDoc.updatedAt),
          });
          console.log(`[BackgroundSync] Added new document from server: ${remoteDoc.title}`);
        } else if (localDoc.lastModified && new Date(remoteDoc.updatedAt) > localDoc.lastModified) {
          // Remote is newer - update local
          await this.db.saveDocument({
            ...localDoc,
            title: remoteDoc.title,
            content: remoteDoc.content,
            contentType: remoteDoc.contentType,
            tags: remoteDoc.tags,
            metadata: remoteDoc.metadata,
            synced: true,
            lastModified: new Date(remoteDoc.updatedAt),
          });
          console.log(`[BackgroundSync] Updated document from server: ${remoteDoc.title}`);
        }
      }

      console.log(`[BackgroundSync] Pulled ${response.data.length} documents from server`);
    } catch (error) {
      console.error('[BackgroundSync] Failed to pull remote changes:', error);
      throw error;
    }
  }
}

// ============================================================================
// Global Instance
// ============================================================================

export const backgroundSync = new BackgroundSync();

// Auto-start in browser
if (typeof window !== 'undefined') {
  // Start sync after page load
  if (document.readyState === 'complete') {
    backgroundSync.start(60000); // Sync every 60 seconds
  } else {
    window.addEventListener('load', () => {
      backgroundSync.start(60000);
    });
  }
}
