'use client';

import * as React from 'react';
import { ArrowDown, ArrowRight, Loader2, Network, RefreshCw, Server, Terminal } from 'lucide-react';
import { toast } from 'sonner';
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
  privateIp: string | null;
};

type Run = {
  id: string;
  status: string;
  metadata?: { domain?: string; lifecycleState?: string };
  nodes: RunNode[];
};

function statusLabel(node: RunNode, paused: boolean) {
  if (paused) return 'Paused';
  if (node.status === 'running') return 'Ready';
  if (node.status === 'failed') return 'Failed';
  if (node.status === 'destroying' || node.status === 'destroyed') return 'Stopping';
  if (node.computeStatus === 'running') return 'Initializing';
  return 'Starting';
}

function nodePurpose(node: RunNode) {
  if (node.role === 'operator') return 'Learner starting point and pentest terminal';
  if (node.role === 'target') return 'Domain-joined Windows workstation';
  return 'Active Directory, DNS, Kerberos and domain services';
}

export default function OperationTopologyBuild({ runId }: { runId: string }) {
  const [run, setRun] = React.useState<Run | null>(null);
  const [loading, setLoading] = React.useState(true);
  const refreshInFlight = React.useRef(false);

  const refresh = React.useCallback(async (quiet = false) => {
    if (refreshInFlight.current) return;
    refreshInFlight.current = true;
    if (!quiet) setLoading(true);
    try {
      const response = await fetch(`/api/operations/runs/${encodeURIComponent(runId)}`, { cache: 'no-store' });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error || 'Could not load the Operation topology');
      setRun(body.run as Run);
    } catch (error) {
      if (!quiet) toast.error(error instanceof Error ? error.message : 'Could not load the Operation topology');
    } finally {
      refreshInFlight.current = false;
      if (!quiet) setLoading(false);
    }
  }, [runId]);

  React.useEffect(() => {
    void refresh();
  }, [refresh]);

  const paused = run?.metadata?.lifecycleState === 'paused';
  const allReady = Boolean(
    run
    && run.status === 'running'
    && run.nodes.length > 0
    && run.nodes.every((node) => node.status === 'running')
  );
  const terminalState = Boolean(run && ['failed', 'destroying', 'destroyed'].includes(run.status));
  const needsProgressPolling = Boolean(run && !paused && !allReady && !terminalState);

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

  if (loading && !run) {
    return <div className="flex min-h-[50vh] items-center justify-center rounded-xl border"><Loader2 className="h-6 w-6 animate-spin" /></div>;
  }
  if (!run) return null;

  const ordered = [
    run.nodes.find((node) => node.role === 'operator'),
    run.nodes.find((node) => node.role === 'target'),
    run.nodes.find((node) => node.role === 'infrastructure'),
  ].filter((node): node is RunNode => Boolean(node));

  return (
    <div className="space-y-3 pb-3">
      <Card>
        <CardContent className="space-y-3 p-4">
          <div className="flex flex-wrap items-center gap-2">
            <Network className="h-4 w-4 text-primary" />
            <span className="text-sm font-semibold">Black Domain — deployed topology</span>
            <Badge variant={run.status === 'running' && !paused ? 'default' : 'outline'}>{paused ? 'Environment paused' : run.status === 'running' ? 'Environment ready' : 'Environment initializing'}</Badge>
            {run.metadata?.domain && <Badge variant="secondary">{run.metadata.domain}</Badge>}
            <Button size="sm" variant="ghost" className="ml-auto" onClick={() => void refresh()}><RefreshCw className="mr-1.5 h-3.5 w-3.5" />Refresh</Button>
          </div>
          <p className="text-xs text-muted-foreground">Build is showing the actual machines created for this Operation. This managed topology is read-only here; ordinary Cyber Lab Build remains editable when no Operation is active.</p>
        </CardContent>
      </Card>

      <div className="rounded-xl border bg-muted/10 p-3 sm:p-5">
        <div className="grid items-stretch gap-2 md:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)_auto_minmax(0,1fr)]">
          {ordered.map((node, index) => (
            <React.Fragment key={node.id}>
              <div className="rounded-xl border bg-card p-4 shadow-sm">
                <div className="flex items-center gap-2">
                  {node.role === 'operator' ? <Terminal className="h-4 w-4" /> : <Server className="h-4 w-4" />}
                  <span className="min-w-0 flex-1 truncate text-sm font-semibold">{node.label}</span>
                  <Badge variant={node.status === 'running' && !paused ? 'default' : 'outline'} className="text-[9px]">{statusLabel(node, Boolean(paused))}</Badge>
                </div>
                <p className="mt-2 text-xs capitalize text-muted-foreground">{node.osFamily} · {node.role}</p>
                <p className="mt-1 font-mono text-[10px] text-muted-foreground">{node.privateIp || 'IP pending'}</p>
                <p className="mt-3 text-xs text-muted-foreground">{nodePurpose(node)}</p>
              </div>
              {index < ordered.length - 1 && (
                <div className="flex items-center justify-center text-muted-foreground">
                  <ArrowDown className="h-5 w-5 md:hidden" />
                  <ArrowRight className="hidden h-5 w-5 md:block" />
                </div>
              )}
            </React.Fragment>
          ))}
        </div>

        <div className="mt-4 grid gap-2 text-xs sm:grid-cols-3">
          <div className="rounded-lg border bg-background/70 p-3"><span className="font-medium">Operator ↔ Workstation</span><p className="mt-1 text-muted-foreground">Enumeration, foothold and direct target access over the private Operation network.</p></div>
          <div className="rounded-lg border bg-background/70 p-3"><span className="font-medium">Operator ↔ Domain Controller</span><p className="mt-1 text-muted-foreground">AD, DNS, Kerberos, LDAP and SMB traffic stays inside the isolated Operation network.</p></div>
          <div className="rounded-lg border bg-background/70 p-3"><span className="font-medium">Workstation ↔ Domain Controller</span><p className="mt-1 text-muted-foreground">The workstation is joined to the Black Domain and uses the controller for domain services.</p></div>
        </div>
      </div>
    </div>
  );
}
