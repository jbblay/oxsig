/**
 * Offline Status Hook
 * 
 * React hook for detecting online/offline status and sync progress.
 * Provides real-time updates for UI indicators.
 */

'use client';

import { useState, useEffect } from 'react';
import {
  startBackgroundSync,
  onSyncProgress,
  forceSyncNow,
  getSyncStatus,
  type SyncProgress,
} from '@/lib/offline/sync';
import { getQueueStats } from '@/lib/offline/queue';

export interface OfflineStatus {
  isOnline: boolean;
  syncStatus: SyncProgress;
  queuedOperations: number;
  sync: () => Promise<void>;
}

/**
 * Hook to monitor online/offline status and sync progress
 */
export function useOfflineStatus(): OfflineStatus {
  const [isOnline, setIsOnline] = useState(
    typeof navigator !== 'undefined' ? navigator.onLine : true
  );
  const [syncStatus, setSyncStatus] = useState<SyncProgress>(getSyncStatus());
  const [queuedOperations, setQueuedOperations] = useState(0);

  useEffect(() => {
    // Update online status
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    // Subscribe to sync progress
    const unsubscribeSync = onSyncProgress((progress) => {
      setSyncStatus(progress);
    });

    // Start background sync
    const stopBackgroundSync = startBackgroundSync();

    // Update queued operations count
    const updateQueueCount = async () => {
      const stats = await getQueueStats();
      setQueuedOperations(stats.pending + stats.syncing);
    };

    updateQueueCount();
    const queueInterval = setInterval(updateQueueCount, 10000); // Update every 10s

    // Cleanup
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      unsubscribeSync();
      stopBackgroundSync();
      clearInterval(queueInterval);
    };
  }, []);

  const sync = async () => {
    try {
      await forceSyncNow();
      const stats = await getQueueStats();
      setQueuedOperations(stats.pending + stats.syncing);
    } catch (error) {
      console.error('Manual sync failed:', error);
      throw error;
    }
  };

  return {
    isOnline,
    syncStatus,
    queuedOperations,
    sync,
  };
}

/**
 * Hook for simple online/offline detection
 */
export function useOnlineStatus(): boolean {
  const [isOnline, setIsOnline] = useState(
    typeof navigator !== 'undefined' ? navigator.onLine : true
  );

  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  return isOnline;
}

/**
 * Hook for queue statistics
 */
export function useQueueStats() {
  const [stats, setStats] = useState({
    pending: 0,
    syncing: 0,
    completed: 0,
    failed: 0,
    total: 0,
  });

  useEffect(() => {
    const updateStats = async () => {
      const queueStats = await getQueueStats();
      setStats(queueStats);
    };

    updateStats();
    const interval = setInterval(updateStats, 5000); // Update every 5s

    return () => clearInterval(interval);
  }, []);

  return stats;
}
