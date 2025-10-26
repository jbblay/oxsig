/**
 * Background Sync Manager
 * 
 * Automatically syncs queued operations when connection is restored.
 * Handles retry logic, error handling, and progress tracking.
 */

import {
  getPendingOperations,
  updateOperationStatus,
  deleteOperation,
  shouldRetry,
  clearCompletedOperations,
  type QueuedOperation,
} from './queue';

export type SyncStatus = 'idle' | 'syncing' | 'error';

export interface SyncProgress {
  status: SyncStatus;
  total: number;
  completed: number;
  failed: number;
  currentOperation?: string;
}

// Sync event listeners
type SyncListener = (progress: SyncProgress) => void;
const syncListeners: Set<SyncListener> = new Set();

let isSyncing = false;
let syncProgress: SyncProgress = {
  status: 'idle',
  total: 0,
  completed: 0,
  failed: 0,
};

/**
 * Subscribe to sync progress updates
 */
export function onSyncProgress(listener: SyncListener): () => void {
  syncListeners.add(listener);
  return () => syncListeners.delete(listener);
}

/**
 * Notify all listeners of sync progress
 */
function notifyListeners() {
  syncListeners.forEach(listener => listener({ ...syncProgress }));
}

/**
 * Execute a single queued operation
 */
async function executeOperation(operation: QueuedOperation): Promise<boolean> {
  try {
    await updateOperationStatus(operation.id!, 'syncing');

    const response = await fetch(operation.endpoint, {
      method: operation.method,
      headers: {
        'Content-Type': 'application/json',
      },
      body: operation.data ? JSON.stringify(operation.data) : undefined,
      credentials: 'include', // Include cookies for authentication
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    // Operation succeeded
    await updateOperationStatus(operation.id!, 'completed');
    
    // Clean up after successful sync
    setTimeout(() => {
      deleteOperation(operation.id!).catch(console.error);
    }, 5000); // Keep for 5 seconds for confirmation

    return true;
  } catch (error) {
    console.error('❌ Operation failed:', operation.type, error);
    
    if (shouldRetry(operation)) {
      await updateOperationStatus(operation.id!, 'pending', String(error));
    } else {
      await updateOperationStatus(operation.id!, 'failed', String(error));
    }
    
    return false;
  }
}

/**
 * Sync all pending operations
 */
export async function syncPendingOperations(): Promise<SyncProgress> {
  if (isSyncing) {
    console.log('⏳ Sync already in progress');
    return syncProgress;
  }

  if (!navigator.onLine) {
    console.log('📡 Offline - skipping sync');
    return syncProgress;
  }

  isSyncing = true;
  syncProgress = {
    status: 'syncing',
    total: 0,
    completed: 0,
    failed: 0,
  };
  notifyListeners();

  try {
    const pending = await getPendingOperations();
    
    if (pending.length === 0) {
      console.log('✅ No pending operations to sync');
      syncProgress.status = 'idle';
      notifyListeners();
      return syncProgress;
    }

    console.log(`🔄 Syncing ${pending.length} pending operations...`);
    syncProgress.total = pending.length;
    notifyListeners();

    for (const operation of pending) {
      syncProgress.currentOperation = operation.type;
      notifyListeners();

      const success = await executeOperation(operation);
      
      if (success) {
        syncProgress.completed++;
      } else {
        syncProgress.failed++;
      }
      
      notifyListeners();

      // Small delay between operations to avoid overwhelming the server
      await new Promise(resolve => setTimeout(resolve, 100));
    }

    // Clean up old completed operations
    await clearCompletedOperations();

    console.log(
      `✅ Sync complete: ${syncProgress.completed} succeeded, ${syncProgress.failed} failed`
    );

    syncProgress.status = syncProgress.failed > 0 ? 'error' : 'idle';
    syncProgress.currentOperation = undefined;
    notifyListeners();

    return syncProgress;
  } catch (error) {
    console.error('❌ Sync error:', error);
    syncProgress.status = 'error';
    syncProgress.currentOperation = undefined;
    notifyListeners();
    throw error;
  } finally {
    isSyncing = false;
  }
}

/**
 * Start automatic background sync
 * Syncs when:
 * - Connection is restored (online event)
 * - Page becomes visible (visibilitychange)
 * - Periodic check (every 5 minutes when online)
 */
export function startBackgroundSync(): () => void {
  console.log('🔄 Starting background sync...');

  // Sync when coming back online
  const handleOnline = () => {
    console.log('📡 Connection restored - syncing...');
    syncPendingOperations().catch(console.error);
  };

  // Sync when page becomes visible
  const handleVisibilityChange = () => {
    if (document.visibilityState === 'visible' && navigator.onLine) {
      syncPendingOperations().catch(console.error);
    }
  };

  // Periodic sync (every 5 minutes when online)
  const periodicSync = setInterval(() => {
    if (navigator.onLine && !isSyncing) {
      syncPendingOperations().catch(console.error);
    }
  }, 5 * 60 * 1000);

  // Register service worker sync
  if ('serviceWorker' in navigator && 'sync' in ServiceWorkerRegistration.prototype) {
    navigator.serviceWorker.ready.then(registration => {
      // @ts-ignore - Background Sync API may not be in all TypeScript versions
      return registration.sync?.register('sync-data');
    }).catch(console.error);
  }

  window.addEventListener('online', handleOnline);
  document.addEventListener('visibilitychange', handleVisibilityChange);

  // Initial sync if online
  if (navigator.onLine) {
    syncPendingOperations().catch(console.error);
  }

  // Cleanup function
  return () => {
    window.removeEventListener('online', handleOnline);
    document.removeEventListener('visibilitychange', handleVisibilityChange);
    clearInterval(periodicSync);
  };
}

/**
 * Force sync now (manual trigger)
 */
export async function forceSyncNow(): Promise<SyncProgress> {
  if (!navigator.onLine) {
    throw new Error('Cannot sync while offline');
  }
  return syncPendingOperations();
}

/**
 * Get current sync status
 */
export function getSyncStatus(): SyncProgress {
  return { ...syncProgress };
}

/**
 * Check if sync is currently running
 */
export function isSyncInProgress(): boolean {
  return isSyncing;
}
