export type LiveWorkspaceRealtimeState = 'disabled' | 'connecting' | 'connected' | 'disconnected';
export type LiveWorkspaceFreshness = 'current' | 'reconnecting' | 'stale' | 'refresh-error';

export const LIVE_WORKSPACE_CONNECTED_REFRESH_MS = 60_000;
export const LIVE_WORKSPACE_DEGRADED_REFRESH_MS = 15_000;
export const LIVE_WORKSPACE_STALE_AFTER_MS = 45_000;
export const LIVE_WORKSPACE_VISIBILITY_RECONCILE_MS = 15_000;

export function liveWorkspaceFallbackInterval(realtimeState: LiveWorkspaceRealtimeState) {
  return realtimeState === 'connected'
    ? LIVE_WORKSPACE_CONNECTED_REFRESH_MS
    : LIVE_WORKSPACE_DEGRADED_REFRESH_MS;
}

export function getLiveWorkspaceFreshness(args: {
  realtimeState: LiveWorkspaceRealtimeState;
  lastSuccessfulSyncAt: number | null;
  now: number;
  refreshFailed: boolean;
}): LiveWorkspaceFreshness {
  if (args.refreshFailed) return 'refresh-error';
  if (args.lastSuccessfulSyncAt === null || args.now - args.lastSuccessfulSyncAt >= LIVE_WORKSPACE_STALE_AFTER_MS) {
    return 'stale';
  }
  if (args.realtimeState === 'connecting' || args.realtimeState === 'disconnected') {
    return 'reconnecting';
  }
  return 'current';
}

export function shouldReconcileLiveWorkspaceOnVisibility(args: {
  realtimeState: LiveWorkspaceRealtimeState;
  hiddenAt: number | null;
  lastSuccessfulSyncAt: number | null;
  now: number;
}) {
  if (args.hiddenAt === null) return false;
  if (args.realtimeState !== 'connected') return true;
  if (args.lastSuccessfulSyncAt === null) return true;
  return args.now - args.hiddenAt >= LIVE_WORKSPACE_VISIBILITY_RECONCILE_MS
    || args.now - args.lastSuccessfulSyncAt >= LIVE_WORKSPACE_STALE_AFTER_MS;
}
