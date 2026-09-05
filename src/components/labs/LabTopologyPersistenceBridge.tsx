'use client';

import * as React from 'react';
import { getCsrfToken } from '@/lib/security/csrf-client';

const TOPOLOGY_KEY = 'oxsig:cyber-lab-topology:v1';
const EMPTY_TOPOLOGY = JSON.stringify({ nodes: [], edges: [] });

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

    const timer = window.setInterval(async () => {
      if (savingRef.current || !syncEnabledRef.current) return;

      const raw = window.localStorage.getItem(TOPOLOGY_KEY) || EMPTY_TOPOLOGY;
      if (raw === lastSyncedRef.current) return;

      const topology = parseLocalTopology(raw);
      if (!topology) return;

      savingRef.current = true;
      try {
        const response = await putTopology(topology);
        if (!response.ok) {
          if (response.status === 401 || response.status === 403 || response.status >= 500) {
            syncEnabledRef.current = false;
          }
          return;
        }
        lastSyncedRef.current = raw;
      } catch {
        syncEnabledRef.current = false;
      } finally {
        savingRef.current = false;
      }
    }, 1200);

    return () => window.clearInterval(timer);
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
