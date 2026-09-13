'use client';

import * as React from 'react';
import { useAuth } from '@/lib/auth/use-auth';
import { getCsrfToken } from '@/lib/security/csrf-client';
import {
  getWorkspaceStateSnapshot,
  mergeWorkspaceState,
  prepareWorkspaceLocalStateForGuest,
  prepareWorkspaceLocalStateForUser,
  subscribeWorkspaceActivity,
  type WorkspaceActivity,
  type WorkspaceRecent,
} from '@/lib/persistence/workspace-activity';

export default function WorkspaceActivitySync() {
  const { isAuthenticated, isLoading, sessionIdentityId } = useAuth();
  const runningRef = React.useRef(false);
  const rerunRef = React.useRef(false);
  const timerRef = React.useRef<number | null>(null);
  const lastUploadedRef = React.useRef<string | null>(null);

  const stateKey = React.useCallback((state: ReturnType<typeof getWorkspaceStateSnapshot>) => (
    `${sessionIdentityId || 'guest'}:${JSON.stringify(state)}`
  ), [sessionIdentityId]);

  const prepareScope = React.useCallback(() => {
    if (isLoading) return false;
    if (!isAuthenticated) {
      prepareWorkspaceLocalStateForGuest();
      return false;
    }
    if (!sessionIdentityId) return false;
    prepareWorkspaceLocalStateForUser(sessionIdentityId);
    return true;
  }, [isAuthenticated, isLoading, sessionIdentityId]);

  const sync = React.useCallback(async () => {
    if (!prepareScope()) return;
    if (runningRef.current) {
      rerunRef.current = true;
      return;
    }

    runningRef.current = true;
    try {
      // Re-assert the browser-account boundary immediately before reading the
      // local cache so an account switch can never upload the previous user's data.
      prepareWorkspaceLocalStateForUser(sessionIdentityId!);
      const snapshot = getWorkspaceStateSnapshot();
      const uploadKey = stateKey(snapshot);
      if ((snapshot.activity.length || snapshot.recents.length) && uploadKey !== lastUploadedRef.current) {
        const csrf = await getCsrfToken();
        const response = await fetch('/api/workspace-state', {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json', 'x-csrf-token': csrf },
          body: JSON.stringify(snapshot),
        });
        if (!response.ok) return;
        lastUploadedRef.current = uploadKey;
      }

      const response = await fetch('/api/workspace-state', {
        credentials: 'include',
        cache: 'no-store',
      });
      if (!response.ok) return;
      const body = await response.json().catch(() => ({}));
      const merged = mergeWorkspaceState({
        activity: Array.isArray(body.activity) ? body.activity as WorkspaceActivity[] : [],
        recents: Array.isArray(body.recents) ? body.recents as WorkspaceRecent[] : [],
      });
      lastUploadedRef.current = stateKey(merged);
    } catch {
      // Local activity remains usable while offline or when durable sync is unavailable.
    } finally {
      runningRef.current = false;
      if (rerunRef.current) {
        rerunRef.current = false;
        window.setTimeout(() => void sync(), 0);
      }
    }
  }, [prepareScope, sessionIdentityId, stateKey]);

  React.useEffect(() => {
    if (isLoading) return;
    prepareScope();
    lastUploadedRef.current = null;
  }, [isLoading, prepareScope, sessionIdentityId]);

  React.useEffect(() => {
    if (!isAuthenticated || isLoading || !sessionIdentityId) return;

    const schedule = () => {
      if (timerRef.current !== null) window.clearTimeout(timerRef.current);
      timerRef.current = window.setTimeout(() => void sync(), 700);
    };
    const refreshWhenVisible = () => {
      if (document.visibilityState === 'visible') void sync();
    };
    const onOnline = () => void sync();

    void sync();
    const unsubscribe = subscribeWorkspaceActivity(schedule);
    window.addEventListener('focus', refreshWhenVisible);
    window.addEventListener('online', onOnline);
    document.addEventListener('visibilitychange', refreshWhenVisible);

    return () => {
      unsubscribe();
      if (timerRef.current !== null) window.clearTimeout(timerRef.current);
      window.removeEventListener('focus', refreshWhenVisible);
      window.removeEventListener('online', onOnline);
      document.removeEventListener('visibilitychange', refreshWhenVisible);
    };
  }, [isAuthenticated, isLoading, sessionIdentityId, sync]);

  return null;
}
