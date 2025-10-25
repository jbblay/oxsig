/**
 * Offline Indicator Component
 * 
 * Shows online/offline status and sync progress in the UI.
 * Displays queue count and allows manual sync trigger.
 */

'use client';

import { Cloud, CloudOff, RefreshCw, CheckCircle, AlertCircle } from 'lucide-react';
import { useOfflineStatus } from '@/hooks/useOfflineStatus';
import { cn } from '@/lib/utils';

export function OfflineIndicator() {
  const { isOnline, syncStatus, queuedOperations, sync } = useOfflineStatus();

  const handleSync = async () => {
    if (!isOnline) return;
    try {
      await sync();
    } catch (error) {
      console.error('Sync failed:', error);
    }
  };

  return (
    <div className="fixed bottom-4 right-4 z-50">
      {/* Offline/Online Badge */}
      <div
        className={cn(
          'flex items-center gap-2 px-4 py-2 rounded-full shadow-lg transition-all',
          isOnline
            ? 'bg-green-500/10 border border-green-500/20 text-green-600 dark:text-green-400'
            : 'bg-orange-500/10 border border-orange-500/20 text-orange-600 dark:text-orange-400'
        )}
      >
        {isOnline ? (
          <Cloud className="h-4 w-4" />
        ) : (
          <CloudOff className="h-4 w-4" />
        )}
        
        <span className="text-sm font-medium">
          {isOnline ? 'Online' : 'Offline'}
        </span>

        {/* Queue Count */}
        {queuedOperations > 0 && (
          <span className="px-2 py-0.5 bg-orange-500/20 rounded-full text-xs font-semibold">
            {queuedOperations}
          </span>
        )}

        {/* Sync Status Icon */}
        {syncStatus.status === 'syncing' && isOnline && (
          <RefreshCw className="h-4 w-4 animate-spin" />
        )}

        {syncStatus.status === 'error' && (
          <AlertCircle className="h-4 w-4 text-red-500" />
        )}

        {/* Manual Sync Button */}
        {isOnline && queuedOperations > 0 && syncStatus.status !== 'syncing' && (
          <button
            onClick={handleSync}
            className="ml-1 p-1 hover:bg-green-500/20 rounded-full transition-colors"
            title="Sync now"
          >
            <RefreshCw className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      {/* Sync Progress */}
      {syncStatus.status === 'syncing' && (
        <div className="mt-2 px-4 py-2 bg-blue-500/10 border border-blue-500/20 rounded-lg shadow-lg">
          <div className="text-xs text-blue-600 dark:text-blue-400 font-medium">
            Syncing {syncStatus.completed}/{syncStatus.total}...
          </div>
          {syncStatus.currentOperation && (
            <div className="text-xs text-blue-500/70 dark:text-blue-400/70 mt-1">
              {syncStatus.currentOperation.replace('_', ' ')}
            </div>
          )}
          <div className="mt-2 w-full bg-blue-500/10 rounded-full h-1.5">
            <div
              className="bg-blue-500 h-1.5 rounded-full transition-all"
              style={{
                width: `${(syncStatus.completed / syncStatus.total) * 100}%`,
              }}
            />
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * Compact version for header/navbar
 */
export function OfflineIndicatorCompact() {
  const { isOnline, queuedOperations } = useOfflineStatus();

  if (isOnline && queuedOperations === 0) {
    return null; // Hide when online and no pending operations
  }

  return (
    <div
      className={cn(
        'flex items-center gap-1.5 px-2 py-1 rounded-md text-xs font-medium',
        isOnline
          ? 'bg-green-500/10 text-green-600 dark:text-green-400'
          : 'bg-orange-500/10 text-orange-600 dark:text-orange-400'
      )}
      title={isOnline ? 'Online' : 'Offline mode'}
    >
      {isOnline ? (
        <Cloud className="h-3 w-3" />
      ) : (
        <CloudOff className="h-3 w-3" />
      )}
      {queuedOperations > 0 && (
        <span className="font-semibold">{queuedOperations}</span>
      )}
    </div>
  );
}
