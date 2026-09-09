'use client';

import * as React from 'react';
import { Activity, Loader2, Monitor, Network, RefreshCw, Server, Terminal } from 'lucide-react';
import { toast } from 'sonner';
import InteractiveSsmDesktop from '@/components/labs/InteractiveSsmDesktop';
import InteractiveSsmTerminal from '@/components/labs/InteractiveSsmTerminal';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';

type RunNode = {
  id: string;
  key: string;
  label: string;
  role: 'operator' | 'target' | 'infrastructure';
  osFamily: string;
  status: string;
  computeStatus?: string;
  readiness?: string;
  privateIp: string | null;
  labInstanceId: string | null;
  lastError: string | null;
};

type Run = {
  id: string;
  operationSlug: string;
  mode: string;
  status: string;
  metadata?: { domain?: string; initialAccess?: { username?: string; available?: boolean } };
  nodes: RunNode[];
};

type AccessMode = 'terminal' | 'desktop';

function learnerStatus(node: RunNode) {
  if (node.status === 'running') return 'Ready';
  if (node.status === 'failed') return 'Failed';
  if (node.status === 'destroying' || node.status === 'destroyed') return 'Stopping';
  if (node.computeStatus === 'running') return 'Initializing';
  if (node.computeStatus === 'pending') return 'Starting';
  return 'Provisioning';
}

function roleHelp(node: RunNode) {
  if (node.role === 'operator') return 'Starting point — use this Ubuntu terminal to work against the domain.';
  if (node.role === 'target') return 'Domain workstation — a Windows target joined to the Black Domain environment.';
  return 'Domain infrastructure — Active Directory and DNS services for the exercise.';
}

export function OperationLabRuntimePanel({ runId }: { runId: string }) {
  const [run, setRun] = React.useState<Run | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [selectedId, setSelectedId] = React.useState<string | null>(null);
  const [accessMode, setAccessMode] = React.useState<AccessMode>('terminal');

  const refresh = React.useCallback(async (quiet = false) => {
    if (!quiet) setLoading(true);
    try {
      const response = await fetch(`/api/operations/runs/${encodeURIComponent(runId)}`, { cache: 'no-store' });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body?.error || 'Could not load Operation runtime');
      const next = body.run as Run;
      setRun(next);
      setSelectedId((current) => current && next.nodes.some((node) => node.id === current)
        ? current
        : next.nodes.find((node) => node.role === 'operator')?.id || next.nodes[0]?.id || null);
    } catch (error) {
      if (!quiet) toast.error(error instanceof Error ? error.message : 'Could not load Operation runtime');
    } finally {
      if (!quiet) setLoading(false);
    }
  }, [runId]);

  React.useEffect(() => {
    void refresh();
    const timer = window.setInterval(() => void refresh(true), 5_000);
    return () => window.clearInterval(timer);
  }, [refresh]);

  const selected = run?.nodes.find((node) => node.id === selectedId) || null;
  const selectedReady = selected?.status === 'running';
  const windows = selected?.osFamily.toLowerCase().includes('windows');

  React.useEffect(() => {
    if (!windows) setAccessMode('terminal');
  }, [windows, selectedId]);

  if (loading && !run) {
    return <div className="flex min-h-56 items-center justify-center rounded-xl border text-sm text-muted-foreground"><Loader2 className="mr-2 h-4 w-4 animate-spin" />Loading the live Operation…</div>;
  }
  if (!run) return null;

  return (
    <div className="space-y-3">
      <Card>
        <CardContent className="space-y-3 p-4">
          <div className="flex flex-wrap items-center gap-2">
            <Network className="h-4 w-4 text-primary" />
            <span className="text-sm font-semibold">Black Domain — live machines</span>
            <Badge variant={run.status === 'running' ? 'default' : 'outline'} className="capitalize">{run.status === 'running' ? 'Environment ready' : 'Environment initializing'}</Badge>
            {run.metadata?.domain && <Badge variant="secondary">{run.metadata.domain}</Badge>}
            <Button size="sm" variant="ghost" className="ml-auto" onClick={() => void refresh()}><RefreshCw className="mr-1.5 h-3.5 w-3.5" />Refresh</Button>
          </div>
          <p className="text-xs text-muted-foreground">These are the same three machines provisioned by Operations. Select a machine below to see its real runtime state and access path.</p>

          <div className="grid gap-2 md:grid-cols-3">
            {run.nodes.map((node) => {
              const ready = node.status === 'running';
              const active = node.id === selectedId;
              return (
                <button key={node.id} type="button" onClick={() => setSelectedId(node.id)} className={`rounded-xl border p-3 text-left transition ${active ? 'border-primary bg-primary/5' : 'hover:bg-muted/30'}`}>
                  <div className="flex items-center gap-2">
                    {node.role === 'operator' ? <Terminal className="h-4 w-4" /> : <Server className="h-4 w-4" />}
                    <span className="min-w-0 flex-1 truncate text-xs font-semibold">{node.label}</span>
                    <Badge variant={ready ? 'default' : 'outline'} className="text-[9px]">{learnerStatus(node)}</Badge>
                  </div>
                  <p className="mt-2 text-[10px] capitalize text-muted-foreground">{node.osFamily} · {node.role}{node.privateIp ? ` · ${node.privateIp}` : ''}</p>
                  <p className="mt-1 text-[10px] text-muted-foreground">{roleHelp(node)}</p>
                </button>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {selected && (
        <Card>
          <CardContent className="space-y-3 p-4">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm font-semibold">{selected.label}</span>
              <Badge variant={selectedReady ? 'default' : 'outline'}>{learnerStatus(selected)}</Badge>
              {selected.computeStatus && selected.computeStatus !== selected.status && <Badge variant="secondary">EC2 {selected.computeStatus}</Badge>}
              {selected.readiness && <Badge variant="outline">{selected.readiness}</Badge>}
            </div>

            {!selectedReady && (
              <div className="flex items-start gap-2 rounded-lg border bg-muted/20 p-3 text-xs text-muted-foreground">
                <Loader2 className="mt-0.5 h-4 w-4 shrink-0 animate-spin" />
                <div><p className="font-medium text-foreground">Machine started; environment is still initializing.</p><p className="mt-1">OXSIG is waiting for SSM and guest services. This page refreshes automatically; you do not need to keep reopening Terminal or Desktop.</p></div>
              </div>
            )}

            {selectedReady && selected.labInstanceId && (
              <>
                <div className="flex gap-2">
                  <Button size="sm" variant={accessMode === 'terminal' ? 'default' : 'outline'} onClick={() => setAccessMode('terminal')}><Terminal className="mr-1.5 h-3.5 w-3.5" />Terminal</Button>
                  {windows && <Button size="sm" variant={accessMode === 'desktop' ? 'default' : 'outline'} onClick={() => setAccessMode('desktop')}><Monitor className="mr-1.5 h-3.5 w-3.5" />Desktop</Button>}
                </div>
                {accessMode === 'desktop' && windows
                  ? <InteractiveSsmDesktop labInstanceId={selected.labInstanceId} machineLabel={selected.label} />
                  : <InteractiveSsmTerminal labInstanceId={selected.labInstanceId} machineLabel={selected.label} />}
              </>
            )}

            {selectedReady && !selected.labInstanceId && <p className="text-xs text-muted-foreground">This node is ready, but no learner access binding is available for it.</p>}
            {selected.lastError && <p className="text-xs text-destructive">{selected.lastError}</p>}
          </CardContent>
        </Card>
      )}

      <div className="rounded-lg border bg-muted/20 p-3 text-xs text-muted-foreground">
        <Activity className="mr-1.5 inline h-3.5 w-3.5" />The starting domain identity shown above belongs to the Black Domain Windows environment. Begin from the Ubuntu operator unless the exercise tells you to sign in directly to a Windows node.
      </div>
    </div>
  );
}
