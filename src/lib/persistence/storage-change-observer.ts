'use client';

type StorageChangeSubscriber = {
  keys: Set<string>;
  callback: () => void;
};

const subscribers = new Set<StorageChangeSubscriber>();

let originalSetItem: typeof Storage.prototype.setItem | null = null;
let originalRemoveItem: typeof Storage.prototype.removeItem | null = null;
let originalClear: typeof Storage.prototype.clear | null = null;
let installed = false;

function isLocalStorage(storage: Storage) {
  try {
    return typeof window !== 'undefined' && storage === window.localStorage;
  } catch {
    return false;
  }
}

function notifySubscribers(key: string | null) {
  for (const subscriber of subscribers) {
    if (key === null || subscriber.keys.has(key)) subscriber.callback();
  }
}

function observedSetItem(this: Storage, key: string, value: string) {
  if (!originalSetItem) return;
  originalSetItem.call(this, key, value);
  if (isLocalStorage(this)) notifySubscribers(key);
}

function observedRemoveItem(this: Storage, key: string) {
  if (!originalRemoveItem) return;
  originalRemoveItem.call(this, key);
  if (isLocalStorage(this)) notifySubscribers(key);
}

function observedClear(this: Storage) {
  if (!originalClear) return;
  originalClear.call(this);
  if (isLocalStorage(this)) notifySubscribers(null);
}

function onStorage(event: StorageEvent) {
  if (event.storageArea !== window.localStorage) return;
  notifySubscribers(event.key);
}

function installObserver() {
  if (installed || typeof window === 'undefined' || typeof Storage === 'undefined') return;

  originalSetItem = Storage.prototype.setItem;
  originalRemoveItem = Storage.prototype.removeItem;
  originalClear = Storage.prototype.clear;
  Storage.prototype.setItem = observedSetItem;
  Storage.prototype.removeItem = observedRemoveItem;
  Storage.prototype.clear = observedClear;
  window.addEventListener('storage', onStorage);
  installed = true;
}

function uninstallObserver() {
  if (!installed || typeof window === 'undefined' || typeof Storage === 'undefined') return;

  window.removeEventListener('storage', onStorage);
  if (Storage.prototype.setItem === observedSetItem && originalSetItem) Storage.prototype.setItem = originalSetItem;
  if (Storage.prototype.removeItem === observedRemoveItem && originalRemoveItem) Storage.prototype.removeItem = originalRemoveItem;
  if (Storage.prototype.clear === observedClear && originalClear) Storage.prototype.clear = originalClear;
  originalSetItem = null;
  originalRemoveItem = null;
  originalClear = null;
  installed = false;
}

export function subscribeToLocalStorageChanges(keys: readonly string[], callback: () => void) {
  const subscriber: StorageChangeSubscriber = { keys: new Set(keys), callback };
  subscribers.add(subscriber);
  installObserver();

  return () => {
    subscribers.delete(subscriber);
    if (subscribers.size === 0) uninstallObserver();
  };
}
