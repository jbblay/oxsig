'use client';

import * as React from 'react';
import { subscribeToLocalStorageChanges } from '@/lib/persistence/storage-change-observer';
import { getCsrfToken } from '@/lib/security/csrf-client';

const TOPOLOGY_KEY = 'oxsig:cyber-lab-topology:v1';
const EMPTY_TOPOLOGY = JSON.stringify({ nodes: [], edges: [] });
const SYNC_DEBOUNCE_MS = 400;
const SYNC_RETRY_MS = 5000;

function parseLocalTopology(raw: string | null) {
  if (!raw) return { nodes: [], edges: [] };
  try {
    const parsed = JSON.parse(raw);
    if (!parsed || !Array.isArray(parsed.nodes) || !Array.isArray(parsed.edges)) return null;
    return parsed;
  } catch {
    return null;
  }
}

async function putTopology(topology: unknown) {
  const csrf = await getCsrfToken();
  return fetch('/api/labs/topology', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', 'x-csrf-token': csrf },
    body: JSON.stringify(topology),
  });
}

export default function LabTopologyPersistenceBridge({ children }: { children: React.ReactNode }) {
  const [ready, setReady] = React.useState(false);
  const syncEnabledRef = React.useRef(true);
  const lastSyncedRef = React.useRef<string | null>(null);
  const savingRef = React.useRef(false);

  React.useEffect(() => {
    let cancelled = false;

    const hydrate = async () => {
      try {
        const response = await fetch('/api/labs/topology', { cache: 'no-store' });
        if (!response.ok) {
          syncEnabledRef.current = false;
          return;
        }

        const body = await response.json().catch(() => ({}));
        if (body.topology) {
          const serialized = JSON.stringify(body.topology);
          window.localStorage.setItem(TOPOLOGY_KEY, serialized);
          lastSyncedRef.current = serialized;
          return;
        }

        const legacyRaw = window.localStorage.getItem(TOPOLOGY_KEY);
        const legacy = parseLocalTopology(legacyRaw);
        if (!legacy) {
          window.localStorage.removeItem(TOPOLOGY_KEY);
          lastSyncedRef.current = EMPTY_TOPOLOGY;
          return;
        }

        if (legacyRaw) {
          const imported = await putTopology(legacy);
          if (imported.ok) {
            lastSyncedRef.current = legacyRaw;
          } else {
            syncEnabledRef.current = false;
          }
        } else {
          lastSyncedRef.current = EMPTY_TOPOLOGY;
        }
      } catch {
        syncEnabledRef.current = false;
      } finally {
        if (!cancelled) setReady(true);
      }
    };

    void hydrate();
    return () => { cancelled = true; };
  }, []);

  React.useEffect(() => {
    if (!ready || !syncEnabledRef.current) return;

    let cancelled = false;
    let timer: number | null = null;
    let queued = false;

    const scheduleSync = (delay = SYNC_DEBOUNCE_MS) => {
      if (cancelled || !syncEnabledRef.current) return;
      if (timer) window.clearTimeout(timer);
      timer = window.setTimeout(() => {
        timer = null;
        void sync();
      }, delay);
    };

    async function sync() {
      if (cancelled || !syncEnabledRef.current) return;
      if (savingRef.current) {
        queued = true;
        return;
      }

      const raw = window.localStorage.getItem(TOPOLOGY_KEY) || EMPTY_TOPOLOGY;
      if (raw === lastSyncedRef.current) return;

      const topology = parseLocalTopology(raw);
      if (!topology) return;

      savingRef.current = true;
      let retry = false;
      try {
        const response = await putTopology(topology);
        if (!response.ok) {
          if (response.status >= 500 || response.status === 408 || response.status === 429) {
            retry = true;
          } else {
            syncEnabledRef.current = false;
          }
          return;
        }
        lastSyncedRef.current = raw;
      } catch {
        retry = true;
      } finally {
        savingRef.current = false;
        if (cancelled || !syncEnabledRef.current) return;
        if (queued) {
          queued = false;
          scheduleSync();
        } else if (retry) {
          scheduleSync(SYNC_RETRY_MS);
        }
      }
    }

    const unsubscribe = subscribeToLocalStorageChanges([TOPOLOGY_KEY], () => scheduleSync());
    // Catch a write that happened while the saved workspace was mounting, then
    // persist only after actual topology mutations instead of waking every 1.2s.
    void sync();

    return () => {
      cancelled = true;
      unsubscribe();
      if (timer) window.clearTimeout(timer);
    };
  }, [ready]);

  if (!ready) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center text-sm text-muted-foreground">
        Loading saved lab workspace…
      </div>
    );
  }

  return <>{children}</>;
}
