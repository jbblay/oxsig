'use client';

import * as React from 'react';
import { AlertTriangle, CheckCircle2, HardDrive, Loader2, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/lib/auth/use-auth';
import {
  GUEST_STORYBOARD_DRAFT_NAMESPACE,
  getStoryboardRecoveryStatus,
  hasRetryableStoryboardRecoverySave,
  retryLastStoryboardRecoverySave,
  storyboardDraftNamespaceForAccount,
  subscribeStoryboardRecoveryStatus,
  type StoryboardDraftNamespace,
  type StoryboardRecoveryStatus,
} from '@/lib/storyboards/storage';

function formatBytes(value: number | null | undefined): string | null {
  if (value === null || value === undefined || !Number.isFinite(value)) return null;
  if (value < 1024) return `${Math.round(value)} B`;
  if (value < 1024 ** 2) return `${(value / 1024).toFixed(1)} KB`;
  if (value < 1024 ** 3) return `${(value / 1024 ** 2).toFixed(1)} MB`;
  return `${(value / 1024 ** 3).toFixed(1)} GB`;
}

function savedTime(value?: number) {
  if (!value) return null;
  return new Date(value).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

export default function BoardRecoveryMonitor() {
  const { isAuthenticated, isLoading: authLoading, sessionIdentityId } = useAuth();
  const [status, setStatus] = React.useState<StoryboardRecoveryStatus>(() =>
    getStoryboardRecoveryStatus()
  );
  const [retrying, setRetrying] = React.useState(false);

  const namespace = React.useMemo<StoryboardDraftNamespace | null>(() => {
    if (isAuthenticated) {
      return sessionIdentityId ? storyboardDraftNamespaceForAccount(sessionIdentityId) : null;
    }
    return authLoading ? null : GUEST_STORYBOARD_DRAFT_NAMESPACE;
  }, [authLoading, isAuthenticated, sessionIdentityId]);

  React.useEffect(() => subscribeStoryboardRecoveryStatus(setStatus), []);

  if (!namespace || status.namespace !== namespace || status.phase === 'idle') return null;

  const isError = status.phase === 'error';
  const usage = formatBytes(status.storage?.usage);
  const quota = formatBytes(status.storage?.quota);
  const percent = status.storage?.ratio !== null && status.storage?.ratio !== undefined
    ? Math.round(status.storage.ratio * 100)
    : null;
  const lastSaved = savedTime(status.lastSavedAt);
  const canRetry = isError && hasRetryableStoryboardRecoverySave(namespace);

  const retry = async () => {
    setRetrying(true);
    try {
      await retryLastStoryboardRecoverySave(namespace);
    } catch {
      // saveStoryboardDraft publishes the actionable error state.
    } finally {
      setRetrying(false);
    }
  };

  return (
    <div
      role={isError ? 'alert' : 'status'}
      className={`mb-3 flex flex-col gap-2 rounded-lg border px-3 py-2 text-sm sm:flex-row sm:items-center sm:justify-between ${
        isError ? 'border-destructive/40 bg-destructive/5' : 'bg-muted/25'
      }`}
    >
      <div className="flex min-w-0 items-start gap-2">
        {status.phase === 'saving' ? (
          <Loader2 className="mt-0.5 h-4 w-4 shrink-0 animate-spin" />
        ) : isError ? (
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
        ) : (
          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
        )}
        <div className="min-w-0">
          <p className={isError ? 'font-medium text-destructive' : 'font-medium'}>
            {status.phase === 'saving'
              ? `Saving local recovery${status.attempt ? ` · attempt ${status.attempt}/3` : ''}`
              : isError
                ? status.errorKind === 'quota'
                  ? 'Local recovery storage is full'
                  : 'Local recovery save failed'
                : `Local recovery saved${lastSaved ? ` · ${lastSaved}` : ''}`}
          </p>
          <p className="text-xs text-muted-foreground">
            {isError
              ? status.message
              : status.prunedDrafts
                ? `${status.prunedDrafts} older server-backed recovery ${status.prunedDrafts === 1 ? 'copy was' : 'copies were'} pruned safely.`
                : 'Recovery stays on this device until you secure the board on the server.'}
          </p>
          {(usage || quota || percent !== null) && (
            <p className="mt-1 flex items-center gap-1 text-[11px] text-muted-foreground">
              <HardDrive className="h-3 w-3" />
              Browser storage
              {usage ? ` ${usage}` : ''}
              {quota ? ` / ${quota}` : ''}
              {percent !== null ? ` (${percent}%)` : ''}
            </p>
          )}
        </div>
      </div>

      {canRetry && (
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="shrink-0 gap-1.5"
          disabled={retrying}
          onClick={() => void retry()}
        >
          {retrying ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
          Retry recovery
        </Button>
      )}
    </div>
  );
}
