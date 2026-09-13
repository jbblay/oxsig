'use client';

import * as React from 'react';
import { getCsrfToken } from '@/lib/security/csrf-client';

export type OperationRunNode = {
  id: string;
  key: string;
  label: string;
  role: 'operator' | 'target' | 'infrastructure';
  osFamily: string;
  status: string;
  computeStatus?: string;
  readiness?: string;
  readinessError?: string | null;
  privateIp: string | null;
  labInstanceId: string | null;
  lastError: string | null;
};

export type OperationRun = {
  id: string;
  operationSlug: string;
  mode: string;
  status: string;
  operatorLabInstanceId?: string | null;
  expiresAt?: string;
  metadata?: {
    domain?: string;
    lifecycle?: string;
    environmentSlot?: string;
    lifecycleState?: string;
    initialAccess?: { username?: string; available?: boolean };
  };
  lastError?: string | null;
  nodes: OperationRunNode[];
};

export type OperationLifecycleProgress = {
  phase: 'active' | 'ready' | 'pausing' | 'paused';
  total: number;
  stopped: number;
  nodeStates: Record<string, string>;
} | null;

type OperationRunPayload = {
  run?: OperationRun;
  lifecycle?: OperationLifecycleProgress;
  error?: string;
};

type RefreshOptions = {
  quiet?: boolean;
  reconcile?: boolean;
};

type OperationRunContextValue = {
  runId: string;
  run: OperationRun | null;
  lifecycle: OperationLifecycleProgress;
  loading: boolean;
  refreshError: string | null;
  allReady: boolean;
  paused: boolean;
  terminalState: boolean;
  needsProgressPolling: boolean;
  refresh: (options?: RefreshOptions) => Promise<void>;
  applyPayload: (payload: OperationRunPayload) => void;
};

const OperationRunContext = React.createContext<OperationRunContextValue | null>(null);

function deriveState(run: OperationRun | null, lifecycle: OperationLifecycleProgress) {
  const pauseRequested = run?.metadata?.lifecycleState === 'paused';
  const terminalState = Boolean(run && ['failed', 'destroying', 'destroyed'].includes(run.status));
  const allReady = Boolean(
    run
    && !pauseRequested
    && run.status === 'running'
    && run.nodes.length > 0
    && run.nodes.every((node) => node.status === 'running'),
  );
  const paused = Boolean(run && pauseRequested && lifecycle?.phase === 'paused');
  const needsProgressPolling = Boolean(
    run
    && !terminalState
    && (pauseRequested ? !paused : !allReady),
  );
  return { allReady, paused, terminalState, needsProgressPolling };
}

export function OperationRunProvider({ runId, children }: { runId: string; children: React.ReactNode }) {
  const [run, setRun] = React.useState<OperationRun | null>(null);
  const [lifecycle, setLifecycle] = React.useState<OperationLifecycleProgress>(null);
  const [loading, setLoading] = React.useState(true);
  const [refreshError, setRefreshError] = React.useState<string | null>(null);
  const requestInFlight = React.useRef(false);
  const activeRunId = React.useRef(runId);
  activeRunId.current = runId;

  const applyPayload = React.useCallback((payload: OperationRunPayload) => {
    if (!payload.run) return;
    const nextRun = payload.run;
    setRun(nextRun);
    setLifecycle((current) => {
      if (payload.lifecycle) return payload.lifecycle;
      // A DB-only GET intentionally has no provider lifecycle payload. Preserve a
      // previously confirmed pause so focus refreshes do not briefly re-enable polling.
      if (nextRun.metadata?.lifecycleState === 'paused' && current?.phase === 'paused') return current;
      return null;
    });
    setRefreshError(null);
  }, []);

  const refresh = React.useCallback(async (options: RefreshOptions = {}) => {
    if (requestInFlight.current) return;
    requestInFlight.current = true;
    const { quiet = false, reconcile = false } = options;
    if (!quiet) setLoading(true);
    try {
      const csrf = reconcile ? await getCsrfToken() : null;
      const response = await fetch(
        reconcile
          ? `/api/operations/runs/${encodeURIComponent(runId)}/reconcile`
          : `/api/operations/runs/${encodeURIComponent(runId)}`,
        reconcile
          ? { method: 'POST', headers: { 'x-csrf-token': csrf! }, cache: 'no-store' }
          : { cache: 'no-store' },
      );
      const body = await response.json().catch(() => ({})) as OperationRunPayload;
      if (!response.ok) throw new Error(body.error || 'Could not load Operation runtime');
      if (activeRunId.current !== runId) return;
      applyPayload(body);
    } catch (error) {
      if (activeRunId.current !== runId) return;
      const message = error instanceof Error ? error.message : 'Could not load Operation runtime';
      setRefreshError(message);
    } finally {
      requestInFlight.current = false;
      if (!quiet && activeRunId.current === runId) setLoading(false);
    }
  }, [applyPayload, runId]);

  React.useEffect(() => {
    setRun(null);
    setLifecycle(null);
    setLoading(true);
    setRefreshError(null);
    void refresh();
  }, [refresh]);

  const state = React.useMemo(() => deriveState(run, lifecycle), [lifecycle, run]);

  React.useEffect(() => {
    if (!state.needsProgressPolling) return;
    const reconcileWhenVisible = () => {
      if (document.visibilityState === 'visible') void refresh({ quiet: true, reconcile: true });
    };
    reconcileWhenVisible();
    const timer = window.setInterval(reconcileWhenVisible, 5_000);
    return () => window.clearInterval(timer);
  }, [refresh, state.needsProgressPolling]);

  React.useEffect(() => {
    const refreshWhenVisible = () => {
      if (document.visibilityState !== 'visible') return;
      void refresh({ quiet: true, reconcile: state.needsProgressPolling });
    };
    window.addEventListener('focus', refreshWhenVisible);
    document.addEventListener('visibilitychange', refreshWhenVisible);
    return () => {
      window.removeEventListener('focus', refreshWhenVisible);
      document.removeEventListener('visibilitychange', refreshWhenVisible);
    };
  }, [refresh, state.needsProgressPolling]);

  const value = React.useMemo<OperationRunContextValue>(() => ({
    runId,
    run,
    lifecycle,
    loading,
    refreshError,
    ...state,
    refresh,
    applyPayload,
  }), [applyPayload, lifecycle, loading, refresh, refreshError, run, runId, state]);

  return <OperationRunContext.Provider value={value}>{children}</OperationRunContext.Provider>;
}

export function useOperationRun() {
  const value = React.useContext(OperationRunContext);
  if (!value) throw new Error('useOperationRun must be used inside OperationRunProvider');
  return value;
}

export function useOptionalOperationRun() {
  return React.useContext(OperationRunContext);
}
