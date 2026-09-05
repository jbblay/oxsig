'use client';

type StorageChangeSubscriber = {
  keys: Set<string>;
  callback: () => void;
};

type StoragePrototype = Pick<Storage, 'setItem' | 'removeItem' | 'clear'>;

const subscribers = new Set<StorageChangeSubscriber>();

let observedPrototype: StoragePrototype | null = null;
let originalSetItem: Storage['setItem'] | null = null;
let originalRemoveItem: Storage['removeItem'] | null = null;
let originalClear: Storage['clear'] | null = null;
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
  if (installed || typeof window === 'undefined') return;

  const prototype = Object.getPrototypeOf(window.localStorage) as StoragePrototype | null;
  if (!prototype) return;

  observedPrototype = prototype;
  originalSetItem = prototype.setItem;
  originalRemoveItem = prototype.removeItem;
  originalClear = prototype.clear;
  prototype.setItem = observedSetItem;
  prototype.removeItem = observedRemoveItem;
  prototype.clear = observedClear;
  window.addEventListener('storage', onStorage);
  installed = true;
}

function uninstallObserver() {
  if (!installed || typeof window === 'undefined') return;

  window.removeEventListener('storage', onStorage);
  if (observedPrototype?.setItem === observedSetItem && originalSetItem) observedPrototype.setItem = originalSetItem;
  if (observedPrototype?.removeItem === observedRemoveItem && originalRemoveItem) observedPrototype.removeItem = originalRemoveItem;
  if (observedPrototype?.clear === observedClear && originalClear) observedPrototype.clear = originalClear;
  observedPrototype = null;
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
