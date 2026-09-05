'use client';

type StorageChangeSubscriber = {
  keys: Set<string>;
  callback: () => void;
};

type LocalPersistenceChangeDetail = {
  key: string;
};

const LOCAL_PERSISTENCE_CHANGE_EVENT = 'oxsig:local-persistence-change';
const subscribers = new Set<StorageChangeSubscriber>();
let installed = false;

function notifySubscribers(key: string | null) {
  for (const subscriber of subscribers) {
    if (key === null || subscriber.keys.has(key)) subscriber.callback();
  }
}

function onLocalPersistenceChange(event: Event) {
  const key = (event as CustomEvent<LocalPersistenceChangeDetail>).detail?.key;
  if (typeof key === 'string' && key) notifySubscribers(key);
}

function onStorage(event: StorageEvent) {
  if (event.storageArea !== window.localStorage) return;
  notifySubscribers(event.key);
}

function installObserver() {
  if (installed || typeof window === 'undefined') return;
  window.addEventListener(LOCAL_PERSISTENCE_CHANGE_EVENT, onLocalPersistenceChange);
  window.addEventListener('storage', onStorage);
  installed = true;
}

function uninstallObserver() {
  if (!installed || typeof window === 'undefined') return;
  window.removeEventListener(LOCAL_PERSISTENCE_CHANGE_EVENT, onLocalPersistenceChange);
  window.removeEventListener('storage', onStorage);
  installed = false;
}

export function notifyLocalStorageChange(key: string) {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent<LocalPersistenceChangeDetail>(LOCAL_PERSISTENCE_CHANGE_EVENT, {
    detail: { key },
  }));
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
