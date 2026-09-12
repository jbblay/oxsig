import { describe, expect, it } from 'vitest';
import {
  LIVE_WORKSPACE_CONNECTED_REFRESH_MS,
  LIVE_WORKSPACE_DEGRADED_REFRESH_MS,
  getLiveWorkspaceFreshness,
  liveWorkspaceFallbackInterval,
  shouldReconcileLiveWorkspaceOnVisibility,
} from './freshness';

describe('Live Workspace freshness policy', () => {
  it('uses low-rate reconciliation when realtime is connected and faster fallback when degraded', () => {
    expect(liveWorkspaceFallbackInterval('connected')).toBe(LIVE_WORKSPACE_CONNECTED_REFRESH_MS);
    expect(liveWorkspaceFallbackInterval('connecting')).toBe(LIVE_WORKSPACE_DEGRADED_REFRESH_MS);
    expect(liveWorkspaceFallbackInterval('disconnected')).toBe(LIVE_WORKSPACE_DEGRADED_REFRESH_MS);
    expect(liveWorkspaceFallbackInterval('disabled')).toBe(LIVE_WORKSPACE_DEGRADED_REFRESH_MS);
  });

  it('distinguishes current, reconnecting, stale, and failed refresh states', () => {
    const now = 100_000;
    expect(getLiveWorkspaceFreshness({ realtimeState: 'connected', lastSuccessfulSyncAt: now - 1_000, now, refreshFailed: false })).toBe('current');
    expect(getLiveWorkspaceFreshness({ realtimeState: 'disconnected', lastSuccessfulSyncAt: now - 1_000, now, refreshFailed: false })).toBe('reconnecting');
    expect(getLiveWorkspaceFreshness({ realtimeState: 'connected', lastSuccessfulSyncAt: now - 50_000, now, refreshFailed: false })).toBe('stale');
    expect(getLiveWorkspaceFreshness({ realtimeState: 'connected', lastSuccessfulSyncAt: now - 1_000, now, refreshFailed: true })).toBe('refresh-error');
  });

  it('reconciles on visibility return after a meaningful hidden period or degraded realtime', () => {
    const now = 100_000;
    expect(shouldReconcileLiveWorkspaceOnVisibility({ realtimeState: 'connected', hiddenAt: now - 2_000, lastSuccessfulSyncAt: now - 2_000, now })).toBe(false);
    expect(shouldReconcileLiveWorkspaceOnVisibility({ realtimeState: 'connected', hiddenAt: now - 20_000, lastSuccessfulSyncAt: now - 20_000, now })).toBe(true);
    expect(shouldReconcileLiveWorkspaceOnVisibility({ realtimeState: 'disconnected', hiddenAt: now - 2_000, lastSuccessfulSyncAt: now - 2_000, now })).toBe(true);
    expect(shouldReconcileLiveWorkspaceOnVisibility({ realtimeState: 'connected', hiddenAt: now - 2_000, lastSuccessfulSyncAt: now - 50_000, now })).toBe(true);
  });
});
