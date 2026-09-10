'use client';

import * as React from 'react';
import { Activity, Loader2, Monitor, Network, RefreshCw, Server, Terminal } from 'lucide-react';
import { toast } from 'sonner';
import InteractiveSsmDesktop from '@/components/labs/InteractiveSsmDesktop';
import InteractiveSsmTerminal from '@/components/labs/InteractiveSsmTerminal';
import OperationAiInstructor from '@/components/operations/OperationAiInstructor';
import OperationNodeTerminal from '@/components/operations/OperationNodeTerminal';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { getOperation } from '@/lib/operations/catalog';

type RunNode = {
  id: string;
  key: string;
  label: string;
  role: 'operator' | 'target' | 'infrastructure';
  osFamily: string;
  status: string;
  computeStatus?: string;
  readiness?: string;
  readinessError?: string | null;
  privateIp: string | null;
  labInstanceId: string | null;
  lastError: string | null;
};

type Run = {
  id: string;
  operationSlug: string;
  mode: string;
  status: string;
  metadata?: {
    domain?: string;
    lifecycleState?: string;
    initialAccess?: { username?: string; available?: boolean };
  };
  nodes: RunNode[];
};

type AccessMode = 'terminal' | 'desktop';

function learnerStatus(node: RunNode, paused: boolean) {
  if (paused) return 'Paused';
  if (node.status === 'running') return 'Exercise ready';
  if (node.status === 'failed') return 'Failed';
  if (node.status === 'destroying' || node.status === 'destroyed') return 'Stopping';
  if (node.computeStatus === 'running') return 'Initializing';
  if (node.computeStatus === 'pending') return 'Starting';
  return 'Provisioning';
}

function readinessLabel(reason?: string) {
  switch (reason) {
    case 'ready': return 'Exercise setup complete';
    case 'probe-pending': return 'Checking exercise setup';
    case 'ssm-offline': return 'Secure session starting';
    case 'marker-missing': return 'Guest setup running';
    case 'probe-failed': return 'Readiness check failed';
    case 'bootstrapping': return 'Guest setup running';
    case 'legacy': return 'Runtime ready';
    case 'unavailable': return 'Access unavailable';
    default: return reason ? 'Checking secure access' : null;
  }
}

function roleHelp(node: RunNode) {
  if (node.role === 'operator') return 'Starting point — use this Ubuntu terminal to work against the domain.';
  if (node.role === 'target') return 'Domain workstation — open Terminal or Desktop when you want to inspect or sign in to this Windows target.';
  return 'Domain controller — Active Directory, DNS and authentication services for the exercise.';
}

export function OperationLabRuntimePanel({ runId }: { runId: string }) {
  const [run, setRun] = React.useState<Run | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [selectedId, setSelectedId] = React.useState<string | null>(null);
  const [accessMode, setAccessMode] = React.useState<AccessMode | null>(null);
  const [refreshError, setRefreshError] = React.useState<string | null>(null);
  const refreshInFlight = React.useRef(false);
  const activeRunId = React.useRef(runId);
  activeRunId.current = runId;

  const refresh = React.useCallback(async (quiet = false) => {
    if (refreshInFlight.current) return;
    refreshInFlight.current = true;
    if (!quiet) setLoading(true);
    try {
      const response = await fetch(`/api/operations/runs/${encodeURIComponent(runId)}`, { cache: 'no-store' });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body?.error || 'Could not load Operation runtime');
      if (activeRunId.current !== runId) return;
      setRefreshError(null);
      const next = body.run as Run;
      setRun(next);
      setSelectedId((current) => current && next.nodes.some((node) => node.id === current)
        ? current
        : next.nodes.find((node) => node.role === 'operator')?.id || next.nodes[0]?.id || null);
    } catch (error) {
      if (activeRunId.current !== runId) return;
      const message = error instanceof Error ? error.message : 'Could not load Operation runtime';
      setRefreshError(message);
      if (!quiet) toast.error(message);
    } finally {
      refreshInFlight.current = false;
      if (!quiet) setLoading(false);
    }
  }, [runId]);

  React.useEffect(() => {
    setRun(null);
    setSelectedId(null);
    void refresh();
    const timer = window.setInterval(() => void refresh(true), 5_000);
    return () => window.clearInterval(timer);
  }, [refresh]);

  const paused = run?.metadata?.lifecycleState === 'paused';
  const selected = (run?.id === runId ? run : null)?.nodes.find((node) => node.id === selectedId) || null;
  const selectedReady = Boolean(selected && !paused && selected.status === 'running');
  const accessAvailable = Boolean(selected && !paused && !['failed', 'destroying', 'destroyed'].includes(run?.status || '') && !['failed', 'destroying', 'destroyed'].includes(selected.status) && (selected.computeStatus === 'running' || selected.status === 'running'));
  const windows = Boolean(selected?.osFamily.toLowerCase().includes('windows'));
  const selectedReadiness = readinessLabel(selected?.readiness);
  const operation = run ? getOperation(run.operationSlug) : null;

  React.useEffect(() => {
    setAccessMode(null);
  }, [selectedId]);

  if (loading && !run) {
    return <div className="flex min-h-56 items-center justify-center rounded-xl border text-sm text-muted-foreground"><Loader2 className="mr-2 h-4 w-4 animate-spin" />Loading the live Operation…</div>;
  }
  if (!run) return <p role="alert" className="text-xs text-destructive">{refreshError || 'Could not load the Operation.'} <Button size="sm" variant="ghost" onClick={() => void refresh()}>Retry</Button></p>;

  return (
    <div className="space-y-3">
      {refreshError && <p role="alert" className="text-xs text-destructive">Status refresh failed: {refreshError}. Displayed status may be stale. Use Refresh to retry.</p>}
      <Card>
        <CardContent className="space-y-3 p-4">
          <div className="flex flex-wrap items-center gap-2">
            <Network className="h-4 w-4 text-primary" />
            <span className="text-sm font-semibold">Black Domain — live machines</span>
            <Badge variant={run.status === 'running' && !paused ? 'default' : 'outline'}>
              {paused ? 'Environment paused' : run.status === 'running' ? 'Environment ready' : 'Environment initializing'}
            </Badge>
            {run.metadata?.domain && <Badge variant="secondary">{run.metadata.domain}</Badge>}
            {run.operationSlug === 'black-domain' && (
              <OperationAiInstructor
                runId={run.id}
                operationSlug={run.operationSlug}
                operationMode={run.mode}
                objectives={operation?.objectives || []}
                nodes={run.nodes}
                selectedNode={selected}
              />
            )}
            <Button size="sm" variant="ghost" className="ml-auto" onClick={() => void refresh()}><RefreshCw className="mr-1.5 h-3.5 w-3.5" />Refresh</Button>
          </div>
          <p className="text-xs text-muted-foreground">These are the same three machines provisioned by Operations and shown in Build. Select the machine you want to use, then choose one of its available access methods.</p>

          <div className="grid gap-2 md:grid-cols-3">
            {run.nodes.map((node) => {
              const ready = node.status === 'running' && !paused;
              const active = node.id === selectedId;
              return (
                <button key={node.id} type="button" onClick={() => { if (node.id !== selectedId) setAccessMode(null); setSelectedId(node.id); }} className={`rounded-xl border p-3 text-left transition ${active ? 'border-primary bg-primary/5' : 'hover:bg-muted/30'}`}>
                  <div className="flex items-center gap-2">
                    {node.role === 'operator' ? <Terminal className="h-4 w-4" /> : <Server className="h-4 w-4" />}
                    <span className="min-w-0 flex-1 truncate text-xs font-semibold">{node.label}</span>
                    <Badge variant={ready ? 'default' : 'outline'} className="text-[9px]">{learnerStatus(node, Boolean(paused))}</Badge>
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
              <Badge variant={selectedReady ? 'default' : 'outline'}>{learnerStatus(selected, Boolean(paused))}</Badge>
              {selected.computeStatus && selected.computeStatus !== selected.status && !paused && <Badge variant="secondary">EC2 {selected.computeStatus}</Badge>}
              {selectedReadiness && !paused && <Badge variant="outline">{selectedReadiness}</Badge>}
            </div>

            {paused ? (
              <div className="rounded-lg border bg-muted/20 p-3 text-xs text-muted-foreground">
                <p className="font-medium text-foreground">Operation paused.</p>
                <p className="mt-1">Resume the Operation from the controls above to restart the machines and check access again.</p>
              </div>
            ) : !accessAvailable ? (
              <div className="flex items-start gap-2 rounded-lg border bg-muted/20 p-3 text-xs text-muted-foreground">
                <Loader2 className="mt-0.5 h-4 w-4 shrink-0 animate-spin" />
                <div>
                  <p className="font-medium text-foreground">Machine access is not available yet.</p>
                  <p className="mt-1">Wait for this machine to start, then open its Terminal or Desktop. Exercise setup is checked separately.</p>
                </div>
              </div>
            ) : (
              <>
                {!selectedReady && <p className="text-xs text-muted-foreground">Exercise setup is not complete. You can try this machine’s access methods now; each connection checks its live availability.</p>}
                <div>
                  <p className="mb-2 text-xs font-medium">Open {selected.label}</p>
                  <div className="flex flex-wrap gap-2">
                    <Button size="sm" variant={accessMode === 'terminal' ? 'default' : 'outline'} onClick={() => setAccessMode('terminal')}><Terminal className="mr-1.5 h-3.5 w-3.5" />Terminal</Button>
                    {windows && <Button size="sm" variant={accessMode === 'desktop' ? 'default' : 'outline'} onClick={() => setAccessMode('desktop')}><Monitor className="mr-1.5 h-3.5 w-3.5" />Desktop</Button>}
                  </div>
                </div>

                {accessMode === 'desktop' && windows ? (
                  <InteractiveSsmDesktop
                    key={`${run.id}:${selected.id}:desktop`}
                    labInstanceId={selected.id}
                    machineLabel={selected.label}
                    sessionEndpoint={`/api/operations/runs/${encodeURIComponent(run.id)}/nodes/${encodeURIComponent(selected.id)}/desktop/session`}
                  />
                ) : accessMode === 'terminal' ? (
                  selected.labInstanceId ? (
                    <InteractiveSsmTerminal key={`${run.id}:${selected.id}:terminal:ai`} labInstanceId={selected.labInstanceId} machineLabel={selected.label} />
                  ) : (
                    <OperationNodeTerminal key={`${run.id}:${selected.id}:terminal`} runId={run.id} nodeId={selected.id} machineLabel={selected.label} />
                  )
                ) : <p className="text-xs text-muted-foreground">Choose an access method to connect to this machine.</p>}
              </>
            )}

            {selected.readinessError && <p role="alert" className="text-xs text-destructive">{selected.readinessError}</p>}
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
