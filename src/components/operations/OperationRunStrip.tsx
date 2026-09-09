'use client';

import * as React from 'react';
import { Loader2, Network, Power, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { getCsrfToken } from '@/lib/security/csrf-client';

type RunNode = {
  id: string;
  key: string;
  label: string;
  role: 'operator' | 'target' | 'infrastructure';
  osFamily: string;
  status: string;
  privateIp: string | null;
  labInstanceId: string | null;
  lastError: string | null;
};

type Run = {
  id: string;
  operationSlug: string;
  mode: string;
  status: string;
  expiresAt: string;
  metadata: {
    domain?: string;
    initialAccess?: { username?: string; password?: string };
  };
  lastError: string | null;
  nodes: RunNode[];
};

export function OperationRunStrip({ runId }: { runId: string }) {
  const [run, setRun] = React.useState<Run | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [busy, setBusy] = React.useState(false);

  const refresh = React.useCallback(async (quiet = false) => {
    if (!quiet) setLoading(true);
    try {
      const response = await fetch(`/api/operations/runs/${encodeURIComponent(runId)}`, { cache: 'no-store' });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body?.error || 'Could not load Operation runtime');
      setRun(body.run as Run);
    } catch (error) {
      if (!quiet) toast.error(error instanceof Error ? error.message : 'Could not load Operation runtime');
    } finally {
      if (!quiet) setLoading(false);
    }
  }, [runId]);

  React.useEffect(() => {
    void refresh();
    const timer = window.setInterval(() => void refresh(true), 10_000);
    return () => window.clearInterval(timer);
  }, [refresh]);

  const destroy = async () => {
    setBusy(true);
    try {
      const csrf = await getCsrfToken();
      const response = await fetch(`/api/operations/runs/${encodeURIComponent(runId)}`, {
        method: 'DELETE',
        headers: { 'x-csrf-token': csrf },
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body?.error || 'Could not end Operation');
      toast.success('Operation shutdown started.');
      await refresh(true);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not end Operation');
    } finally {
      setBusy(false);
    }
  };

  if (loading && !run) {
    return <div className="mb-3 flex min-h-14 items-center justify-center rounded-xl border text-xs text-muted-foreground"><Loader2 className="mr-2 h-4 w-4 animate-spin" />Loading Operation topology…</div>;
  }
  if (!run) return null;

  const initialAccess = run.metadata?.initialAccess;
  return (
    <div className="mb-3 rounded-xl border bg-card/70 p-3">
      <div className="flex flex-wrap items-center gap-2">
        <Network className="h-4 w-4 text-primary" />
        <span className="text-xs font-semibold">Provisioned topology</span>
        <Badge variant={run.status === 'running' ? 'default' : 'outline'} className="h-5 text-[9px] capitalize">{run.status}</Badge>
        {run.metadata?.domain && <Badge variant="secondary" className="h-5 text-[9px]">{run.metadata.domain}</Badge>}
        <div className="ml-auto flex items-center gap-1">
          <Button size="sm" variant="ghost" className="h-7 px-2" onClick={() => void refresh()} disabled={loading}><RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} /></Button>
          {!['destroying','destroyed'].includes(run.status) && (
            <Button size="sm" variant="outline" className="h-7" onClick={() => void destroy()} disabled={busy}>
              {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Power className="h-3.5 w-3.5" />}End operation
            </Button>
          )}
        </div>
      </div>

      <div className="mt-3 grid gap-2 sm:grid-cols-3">
        {run.nodes.map((node) => (
          <div key={node.id} className="rounded-lg border px-2.5 py-2">
            <div className="flex items-center justify-between gap-2">
              <span className="truncate text-[11px] font-semibold">{node.label}</span>
              <Badge variant="outline" className="h-4 px-1 text-[8px] capitalize">{node.status}</Badge>
            </div>
            <p className="mt-1 text-[9px] text-muted-foreground">{node.osFamily} · {node.role}{node.privateIp ? ` · ${node.privateIp}` : ''}</p>
          </div>
        ))}
      </div>

      {initialAccess?.username && initialAccess?.password && (
        <details className="mt-2 rounded-lg border bg-muted/20 px-2.5 py-2">
          <summary className="cursor-pointer text-[10px] font-medium">Starting identity</summary>
          <p className="mt-2 break-all font-mono text-[10px] text-muted-foreground">{initialAccess.username} / {initialAccess.password}</p>
        </details>
      )}
      {run.lastError && <p className="mt-2 text-[10px] text-destructive">{run.lastError}</p>}
      {run.status !== 'running' && !['failed','destroyed'].includes(run.status) && <p className="mt-2 text-[10px] text-muted-foreground">EC2 machines are launching now. AD DS promotion and workstation domain join continue inside the guests after the instances become reachable.</p>}
    </div>
  );
}
