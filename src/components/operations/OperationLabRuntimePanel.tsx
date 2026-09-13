'use client';

import * as React from 'react';
import { Loader2, Monitor, RefreshCw, Terminal } from 'lucide-react';
import { toast } from 'sonner';
import InteractiveSsmDesktop from '@/components/labs/InteractiveSsmDesktop';
import InteractiveSsmTerminal from '@/components/labs/InteractiveSsmTerminal';
import { LabOsIcon } from '@/components/labs/LabMachineNode';
import OperationNodeTerminal from '@/components/operations/OperationNodeTerminal';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import type { LabOsFamily } from '@/lib/labs/types';
import type { OperationAiRuntimeContext } from '@/lib/operations/ai-context';

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

type OpenedSessions = Record<string, true>;
type AccessModes = Record<string, AccessMode>;

function iconFamily(value: string): LabOsFamily {
  const normalized = value.toLowerCase();
  if (normalized.includes('windows')) return 'windows';
  if (normalized.includes('kali')) return 'kali';
  if (normalized.includes('rocky')) return 'rocky';
  if (normalized.includes('amazon')) return 'amazon-linux';
  return 'ubuntu';
}

function isWindows(node: RunNode) {
  return iconFamily(node.osFamily) === 'windows';
}

function learnerStatus(node: RunNode, paused: boolean) {
  if (paused) return 'Paused';
  if (node.status === 'running') return 'Ready';
  if (node.status === 'failed') return 'Failed';
  if (node.status === 'destroying' || node.status === 'destroyed') return 'Ending';
  return 'Starting';
}

function sessionKey(nodeId: string, mode: AccessMode) {
  return `${nodeId}:${mode}`;
}

function defaultNode(nodes: RunNode[]) {
  return nodes.find((node) => node.role === 'target' && isWindows(node))
    || nodes.find((node) => isWindows(node) && node.key === 'workstation')
    || nodes.find((node) => node.role === 'operator')
    || nodes[0]
    || null;
}

export function OperationLabRuntimePanel({
  runId,
  onAiContextChange,
}: {
  runId: string;
  onAiContextChange?: (context: OperationAiRuntimeContext | null) => void;
}) {
  const [run, setRun] = React.useState<Run | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [selectedId, setSelectedId] = React.useState<string | null>(null);
  const [accessModes, setAccessModes] = React.useState<AccessModes>({});
  const [openedSessions, setOpenedSessions] = React.useState<OpenedSessions>({});
  const [refreshError, setRefreshError] = React.useState(false);
  const refreshInFlight = React.useRef(false);
  const activeRunId = React.useRef(runId);
  const defaultDesktopOpenedForRun = React.useRef<string | null>(null);
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
      const next = body.run as Run;
      setRefreshError(false);
      setRun(next);
      setSelectedId((current) => current && next.nodes.some((node) => node.id === current)
        ? current
        : defaultNode(next.nodes)?.id || null);
    } catch (error) {
      if (activeRunId.current !== runId) return;
      console.error('Black Domain runtime refresh failed:', error);
      setRefreshError(true);
      if (!quiet) toast.error('Could not refresh the lab machines.');
    } finally {
      refreshInFlight.current = false;
      if (!quiet) setLoading(false);
    }
  }, [runId]);

  React.useEffect(() => {
    setRun(null);
    setSelectedId(null);
    setAccessModes({});
    setOpenedSessions({});
    setRefreshError(false);
    defaultDesktopOpenedForRun.current = null;
    void refresh();
  }, [refresh]);

  const paused = run?.metadata?.lifecycleState === 'paused';
  const allReady = Boolean(
    run
    && !paused
    && run.status === 'running'
    && run.nodes.length > 0
    && run.nodes.every((node) => node.status === 'running')
  );
  const terminalState = Boolean(run && ['failed', 'destroying', 'destroyed'].includes(run.status));
  const needsProgressPolling = Boolean(run && !paused && !allReady && !terminalState);
  const selected = (run?.id === runId ? run : null)?.nodes.find((node) => node.id === selectedId) || null;
  const selectedMode = selected ? accessModes[selected.id] || null : null;

  React.useEffect(() => {
    if (!needsProgressPolling) return;
    const timer = window.setInterval(() => {
      if (document.visibilityState === 'visible') void refresh(true);
    }, 5_000);
    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') void refresh(true);
    };
    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisibilityChange);
    };
  }, [needsProgressPolling, refresh]);

  const openAccess = React.useCallback((node: RunNode, mode: AccessMode) => {
    if (mode === 'desktop' && !isWindows(node)) return;
    setSelectedId(node.id);
    setAccessModes((current) => ({ ...current, [node.id]: mode }));
    setOpenedSessions((current) => ({ ...current, [sessionKey(node.id, mode)]: true }));
  }, []);

  React.useEffect(() => {
    if (!run || !allReady || defaultDesktopOpenedForRun.current === run.id) return;
    const workstation = run.nodes.find((node) => node.role === 'target' && isWindows(node))
      || run.nodes.find((node) => node.key === 'workstation' && isWindows(node));
    if (!workstation) return;
    defaultDesktopOpenedForRun.current = run.id;
    openAccess(workstation, 'desktop');
  }, [allReady, openAccess, run]);

  React.useEffect(() => {
    if (!onAiContextChange || !run || run.id !== runId) return;
    onAiContextChange({
      runId: run.id,
      operationSlug: run.operationSlug,
      operationMode: run.mode,
      nodes: run.nodes,
      selectedNode: selected,
    });
  }, [onAiContextChange, run, runId, selected]);

  React.useEffect(() => () => onAiContextChange?.(null), [onAiContextChange]);

  if (loading && !run) {
    return <div className="flex min-h-40 items-center justify-center rounded-xl border text-sm text-muted-foreground"><Loader2 className="mr-2 h-4 w-4 animate-spin" />Opening My Lab…</div>;
  }
  if (!run) {
    return <div className="flex items-center justify-between rounded-xl border p-3 text-xs text-muted-foreground"><span>My Lab is temporarily unavailable.</span><Button size="sm" variant="ghost" onClick={() => void refresh()}>Retry</Button></div>;
  }

  // The Operation strip owns provisioning and lifecycle progress. Keep My Lab quiet
  // until the three machines have passed the exercise readiness checks.
  if (!allReady && !paused) return null;

  return (
    <div className="space-y-3">
      {refreshError && (
        <div className="flex items-center justify-between rounded-lg border bg-muted/20 px-3 py-2 text-xs text-muted-foreground">
          <span>Machine status may be out of date.</span>
          <Button size="sm" variant="ghost" className="h-7" onClick={() => void refresh()}><RefreshCw className="mr-1.5 h-3.5 w-3.5" />Refresh</Button>
        </div>
      )}

      <div className="grid gap-2 md:grid-cols-3">
        {run.nodes.map((node) => {
          const active = node.id === selectedId;
          const status = learnerStatus(node, Boolean(paused));
          const ready = status === 'Ready';
          return (
            <button
              key={node.id}
              type="button"
              onClick={() => setSelectedId(node.id)}
              className={`rounded-xl border p-3 text-left transition ${active ? 'border-primary bg-primary/5 ring-1 ring-primary/20' : 'hover:bg-muted/30'}`}
            >
              <div className="flex items-center gap-3">
                <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-muted/60 ring-1 ring-border">
                  <LabOsIcon osFamily={iconFamily(node.osFamily)} className="h-6 w-6" />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="min-w-0 flex-1 truncate text-xs font-semibold">{node.label}</span>
                    <Badge variant={ready ? 'default' : 'outline'} className="h-5 text-[9px]">{status}</Badge>
                  </div>
                  <p className="mt-1 truncate font-mono text-[10px] text-muted-foreground">{node.privateIp || 'IP pending'}</p>
                </div>
              </div>
            </button>
          );
        })}
      </div>

      {selected && (
        <Card>
          <CardContent className="space-y-3 p-4">
            <div className="flex flex-wrap items-center gap-2">
              <LabOsIcon osFamily={iconFamily(selected.osFamily)} className="h-5 w-5" />
              <span className="text-sm font-semibold">{selected.label}</span>
              {selected.privateIp && <span className="font-mono text-[10px] text-muted-foreground">{selected.privateIp}</span>}
              <div className="ml-auto flex flex-wrap gap-2">
                <Button
                  size="sm"
                  variant={selectedMode === 'terminal' ? 'default' : 'outline'}
                  onClick={() => openAccess(selected, 'terminal')}
                  disabled={Boolean(paused)}
                >
                  <Terminal className="mr-1.5 h-3.5 w-3.5" />Terminal
                </Button>
                {isWindows(selected) && (
                  <Button
                    size="sm"
                    variant={selectedMode === 'desktop' ? 'default' : 'outline'}
                    onClick={() => openAccess(selected, 'desktop')}
                    disabled={Boolean(paused)}
                  >
                    <Monitor className="mr-1.5 h-3.5 w-3.5" />Desktop
                  </Button>
                )}
              </div>
            </div>

            {!paused && !selectedMode && <p className="text-xs text-muted-foreground">Choose Terminal{isWindows(selected) ? ' or Desktop' : ''}.</p>}
            {paused && <Badge variant="outline">Paused</Badge>}

            <div className={paused ? 'hidden' : 'block'} aria-hidden={Boolean(paused)}>
              {run.nodes.flatMap((node) => {
                const modes: AccessMode[] = isWindows(node) ? ['terminal', 'desktop'] : ['terminal'];
                return modes.map((mode) => {
                  const key = sessionKey(node.id, mode);
                  if (!openedSessions[key]) return null;
                  const active = node.id === selectedId && accessModes[node.id] === mode;
                  return (
                    <div key={`${run.id}:${key}`} className={active ? 'block' : 'hidden'} aria-hidden={!active}>
                      {mode === 'desktop' ? (
                        <InteractiveSsmDesktop
                          labInstanceId={node.id}
                          machineLabel={node.label}
                          sessionEndpoint={`/api/operations/runs/${encodeURIComponent(run.id)}/nodes/${encodeURIComponent(node.id)}/desktop/session`}
                        />
                      ) : node.labInstanceId ? (
                        <InteractiveSsmTerminal labInstanceId={node.labInstanceId} machineLabel={node.label} />
                      ) : (
                        <OperationNodeTerminal runId={run.id} nodeId={node.id} machineLabel={node.label} />
                      )}
                    </div>
                  );
                });
              })}
            </div>

            {(selected.readinessError || selected.lastError) && !paused && (
              <p role="alert" className="text-xs text-destructive">This machine needs attention. Refresh and try again.</p>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
