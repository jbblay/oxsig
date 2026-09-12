export type ResourcePanelStatus = 'loading' | 'success' | 'empty' | 'stale' | 'error';

export type ResourcePanelState<T> = {
  data: T | null;
  status: ResourcePanelStatus;
  error: string | null;
  refreshing: boolean;
};

export function createResourcePanelState<T>(): ResourcePanelState<T> {
  return {
    data: null,
    status: 'loading',
    error: null,
    refreshing: false,
  };
}

export function beginResourcePanelLoad<T>(state: ResourcePanelState<T>): ResourcePanelState<T> {
  return {
    ...state,
    status: state.data === null ? 'loading' : state.status,
    error: state.data === null ? null : state.error,
    refreshing: true,
  };
}

export function resolveResourcePanelSuccess<T>(data: T, empty: boolean): ResourcePanelState<T> {
  return {
    data,
    status: empty ? 'empty' : 'success',
    error: null,
    refreshing: false,
  };
}

export function resolveResourcePanelFailure<T>(
  state: ResourcePanelState<T>,
  error: string
): ResourcePanelState<T> {
  return {
    ...state,
    status: state.data === null ? 'error' : 'stale',
    error,
    refreshing: false,
  };
}

export function knownResourceCount<T>(state: ResourcePanelState<T[]>): number | null {
  return state.data === null ? null : state.data.length;
}
