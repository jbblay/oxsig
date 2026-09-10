'use client';

import * as React from 'react';
import { Eye, Loader2, Network, Pause, Play, RefreshCw, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { RuntimeProgress } from '@/components/warroom/RuntimeProgress';
import { getCsrfToken } from '@/lib/security/csrf-client';

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
  expiresAt: string;
  metadata: {
    domain?: string;
    lifecycleState?: string;
    initialAccess?: { username?: string; available?: boolean };
  };
  lastError: string | null;
  nodes: RunNode[];
};

type RevealedAccess = { username: string; password: string };
type BusyAction = 'pause' | 'resume' | 'destroy' | null;

function readinessLabel(node: RunNode, paused: boolean) {
  if (paused) return 'paused';
  if (node.status === 'running') return 'ready';
  if (node.status === 'destroying' || node.status === 'destroyed' || node.status === 'failed') return node.status;
  if (node.computeStatus === 'running') return 'initializing';
  if (node.computeStatus === 'pending') return 'starting';
  return node.computeStatus || node.status;
}

export function OperationRunStrip({ runId, compact = false }: { runId: string; compact?: boolean }) {
  const [run, setRun] = React.useState<Run | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [busy, setBusy] = React.useState<BusyAction>(null);
  const [revealingAccess, setRevealingAccess] = React.useState(false);
  const [revealedAccess, setRevealedAccess] = React.useState<RevealedAccess | null>(null);

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
    setRevealedAccess(null);
    void refresh();
    const timer = window.setInterval(() => void refresh(true), 5_000);
    return () => window.clearInterval(timer);
  }, [refresh]);

  const changeLifecycle = async (action: 'pause' | 'resume') => {
    setBusy(action);
    try {
      const csrf = await getCsrfToken();
      const response = await fetch(`/api/operations/runs/${encodeURIComponent(runId)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', 'x-csrf-token': csrf },
        body: JSON.stringify({ action }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body?.error || `Could not ${action} Operation`);
      toast.success(action === 'pause' ? 'Pausing all Operation machines.' : 'Starting all Operation machines.');
      setRevealedAccess(null);
      if (body.run) setRun(body.run as Run);
      else await refresh(true);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : `Could not ${action} Operation`);
    } finally {
      setBusy(null);
    }
  };

  const destroy = async () => {
    if (!window.confirm('End and permanently destroy this Operation? All three machines will be terminated.')) return;
    setBusy('destroy');
    try {
      const csrf = await getCsrfToken();
      const response = await fetch(`/api/operations/runs/${encodeURIComponent(runId)}`, {
        method: 'DELETE',
        headers: { 'x-csrf-token': csrf },
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body?.error || 'Could not end Operation');
      toast.success('Destruction started for all Operation machines.');
      setRevealedAccess(null);
      await refresh(true);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not end Operation');
    } finally {
      setBusy(null);
    }
  };

  const revealAccess = async () => {
    setRevealingAccess(true);
    try {
      const csrf = await getCsrfToken();
      const response = await fetch(`/api/operations/runs/${encodeURIComponent(runId)}/access`, {
        method: 'POST',
        headers: { 'x-csrf-token': csrf },
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body?.error || 'Could not reveal starting access');
      if (typeof body?.username !== 'string' || typeof body?.password !== 'string') {
        throw new Error('Starting access response was incomplete');
      }
      setRevealedAccess({ username: body.username, password: body.password });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not reveal starting access');
    } finally {
      setRevealingAccess(false);
    }
  };

  if (loading && !run) {
    return <div className="mb-3 flex min-h-14 items-center justify-center rounded-xl border text-xs text-muted-foreground"><Loader2 className="mr-2 h-4 w-4 animate-spin" />Loading Operation topology…</div>;
  }
  if (!run) return null;

  const initialAccess = run.metadata?.initialAccess;
  const paused = run.metadata?.lifecycleState === 'paused';
  const bootstrapping = run.nodes.some((node) => node.computeStatus === 'running' && node.status === 'provisioning');
  const terminalState = ['destroying', 'destroyed', 'failed'].includes(run.status);

  return (
    <div className="mb-3 rounded-xl border bg-card/70 p-3">
      <div className="flex flex-wrap items-center gap-2">
        <Network className="h-4 w-4 text-primary" />
        <span className="text-xs font-semibold">{compact ? 'Environment readiness' : 'Provisioned topology'}</span>
        <Badge variant={run.status === 'running' && !paused ? 'default' : 'outline'} className="h-5 text-[9px] capitalize">
          {paused ? 'paused' : run.status}
        </Badge>
        {run.metadata?.domain && <Badge variant="secondary" className="h-5 text-[9px]">{run.metadata.domain}</Badge>}
        <div className="ml-auto flex flex-wrap items-center justify-end gap-1">
          <Button size="sm" variant="ghost" className="h-7 px-2" aria-label="Refresh environment status" onClick={() => void refresh()} disabled={loading || Boolean(busy)}><RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} /></Button>
          {!terminalState && paused && (
            <Button size="sm" variant="outline" className="h-7" onClick={() => void changeLifecycle('resume')} disabled={Boolean(busy)}>
              {busy === 'resume' ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <Play className="mr-1.5 h-3.5 w-3.5" />}Resume
            </Button>
          )}
          {!terminalState && !paused && run.status === 'running' && (
            <Button size="sm" variant="outline" className="h-7" onClick={() => void changeLifecycle('pause')} disabled={Boolean(busy)}>
              {busy === 'pause' ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <Pause className="mr-1.5 h-3.5 w-3.5" />}Pause
            </Button>
          )}
          {!['destroying', 'destroyed'].includes(run.status) && (
            <Button size="sm" variant="outline" className="h-7" onClick={() => void destroy()} disabled={Boolean(busy)}>
              {busy === 'destroy' ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <Trash2 className="mr-1.5 h-3.5 w-3.5" />}End &amp; destroy
            </Button>
          )}
        </div>
      </div>

      {compact ? <RuntimeProgress nodes={run.nodes} paused={paused} status={run.status} /> : <div className="mt-3 grid gap-2 sm:grid-cols-3">
        {run.nodes.map((node) => (
          <div key={node.id} className="rounded-lg border px-2.5 py-2">
            <div className="flex items-center justify-between gap-2">
              <span className="truncate text-[11px] font-semibold">{node.label}</span>
              <Badge variant={node.status === 'running' && !paused ? 'default' : 'outline'} className="h-4 px-1 text-[8px] capitalize">{readinessLabel(node, paused)}</Badge>
            </div>
            <p className="mt-1 text-[9px] text-muted-foreground">
              {node.osFamily} · {node.role}{node.privateIp ? ` · ${node.privateIp}` : ''}
              {node.computeStatus && node.computeStatus !== node.status && !paused ? ` · EC2 ${node.computeStatus}` : ''}
            </p>
          </div>
        ))}
      </div>}

      {initialAccess?.username && initialAccess.available && !paused && !terminalState && (
        <details className="mt-2 rounded-lg border bg-muted/20 px-2.5 py-2" onToggle={(event) => {
          if (event.currentTarget.open && !revealedAccess && !revealingAccess) void revealAccess();
        }}>
          <summary className="cursor-pointer text-[10px] font-medium">Starting identity</summary>
          <div className="mt-2">
            {revealingAccess ? (
              <p className="flex items-center gap-1.5 text-[10px] text-muted-foreground"><Loader2 className="h-3 w-3 animate-spin" />Authorizing reveal…</p>
            ) : revealedAccess ? (
              <p className="break-all font-mono text-[10px] text-muted-foreground">{revealedAccess.username} / {revealedAccess.password}</p>
            ) : (
              <Button size="sm" variant="ghost" className="h-7 px-2 text-[10px]" onClick={() => void revealAccess()}>
                <Eye className="mr-1.5 h-3 w-3" />Reveal starting password
              </Button>
            )}
          </div>
        </details>
      )}
      {run.lastError && <p className="mt-2 text-[10px] text-destructive">{run.lastError}</p>}
      {!compact && (paused ? (
        <p className="mt-2 text-[10px] text-muted-foreground">Operation paused. All three EC2 machines are being kept as the same environment without being destroyed. Resume when you are ready to continue.</p>
      ) : run.status !== 'running' && !['failed', 'destroyed'].includes(run.status) ? (
        <p className="mt-2 text-[10px] text-muted-foreground">
          {bootstrapping
            ? 'EC2 is online. OXSIG is checking Systems Manager and guest readiness while AD DS promotion, domain join, and operator tooling finish.'
            : 'EC2 machines are launching. OXSIG will keep the Operation in provisioning until guest readiness is verified.'}
        </p>
      ) : null)}
    </div>
  );
}

