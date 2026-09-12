import { describe, expect, it } from 'vitest';
import {
  beginResourcePanelLoad,
  createResourcePanelState,
  knownResourceCount,
  resolveResourcePanelFailure,
  resolveResourcePanelSuccess,
} from './panel-state';

describe('resource panel state', () => {
  it('keeps known empty distinct from request failure and unknown counts', () => {
    const initial = createResourcePanelState<string[]>();
    expect(initial.status).toBe('loading');
    expect(knownResourceCount(initial)).toBeNull();

    const empty = resolveResourcePanelSuccess<string[]>([], true);
    expect(empty.status).toBe('empty');
    expect(knownResourceCount(empty)).toBe(0);

    const failed = resolveResourcePanelFailure(initial, 'offline');
    expect(failed.status).toBe('error');
    expect(failed.data).toBeNull();
    expect(knownResourceCount(failed)).toBeNull();
  });

  it('preserves the last successful data as stale and clears stale state after recovery', () => {
    const loaded = resolveResourcePanelSuccess(['one', 'two'], false);
    const refreshing = beginResourcePanelLoad(loaded);
    expect(refreshing.data).toEqual(['one', 'two']);
    expect(refreshing.refreshing).toBe(true);

    const stale = resolveResourcePanelFailure(refreshing, 'refresh failed');
    expect(stale.status).toBe('stale');
    expect(stale.data).toEqual(['one', 'two']);
    expect(stale.error).toBe('refresh failed');
    expect(knownResourceCount(stale)).toBe(2);

    const recovered = resolveResourcePanelSuccess(['one', 'two', 'three'], false);
    expect(recovered.status).toBe('success');
    expect(recovered.error).toBeNull();
    expect(knownResourceCount(recovered)).toBe(3);
  });
});
