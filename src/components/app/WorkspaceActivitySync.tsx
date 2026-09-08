'use client';

import * as React from 'react';
import { useAuth } from '@/lib/auth/use-auth';
import { getCsrfToken } from '@/lib/security/csrf-client';
import {
  getWorkspaceStateSnapshot,
  mergeWorkspaceState,
  subscribeWorkspaceActivity,
  type WorkspaceActivity,
  type WorkspaceRecent,
} from '@/lib/persistence/workspace-activity';

export default function WorkspaceActivitySync() {
  const { isAuthenticated, isLoading } = useAuth();
  const runningRef = React.useRef(false);
  const rerunRef = React.useRef(false);
  const timerRef = React.useRef<number | null>(null);

  const sync = React.useCallback(async () => {
    if (!isAuthenticated || isLoading) return;
    if (runningRef.current) {
      rerunRef.current = true;
      return;
    }

    runningRef.current = true;
    try {
      const snapshot = getWorkspaceStateSnapshot();
      if (snapshot.activity.length || snapshot.recents.length) {
        const csrf = await getCsrfToken();
        const response = await fetch('/api/workspace-state', {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json', 'x-csrf-token': csrf },
          body: JSON.stringify(snapshot),
        });
        if (!response.ok) return;
      }

      const response = await fetch('/api/workspace-state', {
        credentials: 'include',
        cache: 'no-store',
      });
      if (!response.ok) return;
      const body = await response.json().catch(() => ({}));
      mergeWorkspaceState({
        activity: Array.isArray(body.activity) ? body.activity as WorkspaceActivity[] : [],
        recents: Array.isArray(body.recents) ? body.recents as WorkspaceRecent[] : [],
      });
    } catch {
      // Local activity remains authoritative while offline or when sync is unavailable.
    } finally {
      runningRef.current = false;
      if (rerunRef.current) {
        rerunRef.current = false;
        window.setTimeout(() => void sync(), 0);
      }
    }
  }, [isAuthenticated, isLoading]);

  React.useEffect(() => {
    if (!isAuthenticated || isLoading) return;

    const schedule = () => {
      if (timerRef.current !== null) window.clearTimeout(timerRef.current);
      timerRef.current = window.setTimeout(() => void sync(), 700);
    };
    const onFocus = () => void sync();
    const onOnline = () => void sync();

    void sync();
    const unsubscribe = subscribeWorkspaceActivity(schedule);
    const interval = window.setInterval(() => void sync(), 60_000);
    window.addEventListener('focus', onFocus);
    window.addEventListener('online', onOnline);

    return () => {
      unsubscribe();
      if (timerRef.current !== null) window.clearTimeout(timerRef.current);
      window.clearInterval(interval);
      window.removeEventListener('focus', onFocus);
      window.removeEventListener('online', onOnline);
    };
  }, [isAuthenticated, isLoading, sync]);

  return null;
}
