import { afterEach, describe, expect, it, vi } from 'vitest';
import { subscribeToLocalStorageChanges } from './storage-change-observer';

describe('storage-change-observer', () => {
  const cleanups: Array<() => void> = [];

  afterEach(() => {
    while (cleanups.length) cleanups.pop()?.();
    window.localStorage.clear();
    vi.restoreAllMocks();
  });

  it('notifies for tracked same-window writes only', () => {
    const callback = vi.fn();
    cleanups.push(subscribeToLocalStorageChanges(['tracked'], callback));

    window.localStorage.setItem('other', '1');
    window.localStorage.setItem('tracked', '1');
    window.localStorage.removeItem('tracked');

    expect(callback).toHaveBeenCalledTimes(2);
  });

  it('notifies tracked subscribers when localStorage is cleared', () => {
    const callback = vi.fn();
    cleanups.push(subscribeToLocalStorageChanges(['tracked'], callback));

    window.localStorage.setItem('tracked', '1');
    callback.mockClear();
    window.localStorage.clear();

    expect(callback).toHaveBeenCalledTimes(1);
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

  it('stops notifying after unsubscribe', () => {
    const callback = vi.fn();
    const unsubscribe = subscribeToLocalStorageChanges(['tracked'], callback);
    unsubscribe();

    window.localStorage.setItem('tracked', '1');
    expect(callback).not.toHaveBeenCalled();
  });
});
