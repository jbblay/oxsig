import { afterEach, describe, expect, it, vi } from 'vitest';
import { notifyLocalStorageChange, subscribeToLocalStorageChanges } from './storage-change-observer';

describe('storage-change-observer', () => {
  const cleanups: Array<() => void> = [];

  afterEach(() => {
    while (cleanups.length) cleanups.pop()?.();
    window.localStorage.clear();
    vi.restoreAllMocks();
  });

  it('notifies for tracked same-window persistence events only', () => {
    const callback = vi.fn();
    cleanups.push(subscribeToLocalStorageChanges(['tracked'], callback));

    notifyLocalStorageChange('other');
    notifyLocalStorageChange('tracked');
    notifyLocalStorageChange('tracked');

    expect(callback).toHaveBeenCalledTimes(2);
  });

  it('observes cross-document storage events', () => {
    const callback = vi.fn();
    cleanups.push(subscribeToLocalStorageChanges(['tracked'], callback));

    window.dispatchEvent(new StorageEvent('storage', {
      key: 'tracked',
      storageArea: window.localStorage,
      newValue: '2',
    }));

    expect(callback).toHaveBeenCalledTimes(1);
  });

  it('treats a cross-document clear as a tracked change', () => {
    const callback = vi.fn();
    cleanups.push(subscribeToLocalStorageChanges(['tracked'], callback));

    window.dispatchEvent(new StorageEvent('storage', {
      key: null,
      storageArea: window.localStorage,
    }));

    expect(callback).toHaveBeenCalledTimes(1);
  });

  it('stops notifying after unsubscribe', () => {
    const callback = vi.fn();
    const unsubscribe = subscribeToLocalStorageChanges(['tracked'], callback);
    unsubscribe();

    notifyLocalStorageChange('tracked');
    expect(callback).not.toHaveBeenCalled();
  });
});
