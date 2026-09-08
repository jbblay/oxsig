'use client';

import * as React from 'react';
import { RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  loadDurableLabTopology,
  saveDurableLabTopology,
} from '@/lib/labs/topology-client';
import type { LabTopology } from '@/lib/labs/topology-schema';

type ContextValue = {
  initialTopology: LabTopology;
  saveTopology: (topology: LabTopology) => Promise<LabTopology>;
};

const LabTopologyDurableStateContext = React.createContext<ContextValue | null>(null);

export default function LabTopologyDurableStateProvider({ children }: { children: React.ReactNode }) {
  const [initialTopology, setInitialTopology] = React.useState<LabTopology | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  const load = React.useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const topology = await loadDurableLabTopology();
      setInitialTopology(topology);
    } catch (loadError) {
      setInitialTopology(null);
      setError(loadError instanceof Error ? loadError.message : 'Cyber Lab topology could not be loaded');
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    void load();
  }, [load]);

  const saveTopology = React.useCallback(async (topology: LabTopology) => {
    return saveDurableLabTopology(topology);
  }, []);

  const value = React.useMemo<ContextValue | null>(() => (
    initialTopology ? { initialTopology, saveTopology } : null
  ), [initialTopology, saveTopology]);

  if (loading) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center gap-2 text-sm text-muted-foreground">
        <RefreshCw className="h-4 w-4 animate-spin" /> Loading saved lab topology…
      </div>
    );
  }

  if (error || !value) {
    return (
      <div className="flex min-h-[50vh] flex-col items-center justify-center gap-3 px-4 text-center">
        <div>
          <p className="text-sm font-medium">Saved lab topology could not be loaded</p>
          <p className="mt-1 max-w-xl text-xs leading-5 text-muted-foreground">
            {error || 'The saved topology is unavailable.'} OXSIG will not open an empty browser copy over your durable server state.
          </p>
        </div>
        <Button size="sm" variant="outline" onClick={() => void load()}>
          <RefreshCw className="mr-2 h-3.5 w-3.5" /> Retry topology load
        </Button>
      </div>
    );
  }

  return (
    <LabTopologyDurableStateContext.Provider value={value}>
      {children}
    </LabTopologyDurableStateContext.Provider>
  );
}

export function useLabTopologyDurableState() {
  const value = React.useContext(LabTopologyDurableStateContext);
  if (!value) throw new Error('useLabTopologyDurableState must be used inside LabTopologyDurableStateProvider');
  return value;
}
