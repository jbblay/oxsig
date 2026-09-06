'use client';

import * as React from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  FileCog,
  KeyRound,
  Loader2,
  LockKeyhole,
  Network,
  RefreshCw,
  Server,
  ShieldAlert,
} from 'lucide-react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import type { DeploymentPlan } from '@/lib/infrastructure/deployment-plan-schema';
import { getCsrfToken } from '@/lib/security/csrf-client';

type PlanResponse = {
  planId: string;
  planHash: string;
  sourceDesignUpdatedAt: string;
  generatedAt: string;
  plan: DeploymentPlan;
};

type ExecutionSupport = {
  supported: boolean;
  adapter: 'existing-lab-vm' | 'none';
  reasons: string[];
  target?: {
    nodeId: string;
    labSlug: string;
    accessMode: 'terminal' | 'desktop';
  };
};

type AuthorizationView = {
  id: string;
  planId: string;
  planHash: string;
  state: 'authorized' | 'receipt_issued' | 'executing' | 'evidence_recorded' | 'analyzed' | 'cancelled' | 'expired' | 'failed';
  expiresAt: string;
  executionSupport: ExecutionSupport;
};

type ReceiptView = {
  executionId: string;
  authorizationId: string;
  planId: string;
  planHash: string;
  adapter: 'existing-lab-vm';
  target: {
    nodeId: string;
    labSlug: string;
    accessMode: 'terminal' | 'desktop';
  };
  issuedAt: string;
};

const PHASE_LABELS: Record<DeploymentPlan['actions'][number]['phase'], string> = {
  network: 'Network segments',
  compute: 'Compute workloads',
  'network-functions': 'Network functions',
  connectivity: 'Connectivity',
  verification: 'Runtime verification',
};

export default function DeploymentPlanner() {
  const [result, setResult] = React.useState<PlanResponse | null>(null);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [authorization, setAuthorization] = React.useState<AuthorizationView | null>(null);
  const [receipt, setReceipt] = React.useState<ReceiptView | null>(null);
  const [authorizing, setAuthorizing] = React.useState(false);
  const [issuingReceipt, setIssuingReceipt] = React.useState(false);

  const generatePlan = React.useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const csrf = await getCsrfToken();
      const response = await fetch('/api/labs/infrastructure-plan', {
        method: 'POST',
        headers: { 'x-csrf-token': csrf },
        cache: 'no-store',
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error || 'Could not generate a deployment plan');
      setResult(body as PlanResponse);
      setAuthorization(null);
      setReceipt(null);
    } catch (planError) {
      const message = planError instanceof Error ? planError.message : 'Could not generate a deployment plan';
      setError(message);
      toast.error(message);
    } finally {
      setLoading(false);
    }
  }, []);

  const authorizePlan = React.useCallback(async () => {
    if (!result) return;
    setAuthorizing(true);
    setError(null);
    try {
      const csrf = await getCsrfToken();
      const response = await fetch('/api/labs/infrastructure-plan/authorize', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-csrf-token': csrf,
        },
        body: JSON.stringify({ planHash: result.planHash, confirm: true }),
        cache: 'no-store',
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error || 'Could not authorize the deployment plan');
      setAuthorization(body.authorization as AuthorizationView);
      setReceipt(null);
      toast.success('Exact deployment plan authorized');
    } catch (authorizationError) {
      const message = authorizationError instanceof Error ? authorizationError.message : 'Could not authorize the deployment plan';
      setError(message);
      toast.error(message);
    } finally {
      setAuthorizing(false);
    }
  }, [result]);

  const issueExecutionReceipt = React.useCallback(async () => {
    if (!authorization) return;
    setIssuingReceipt(true);
    setError(null);
    try {
      const csrf = await getCsrfToken();
      const response = await fetch('/api/labs/infrastructure-plan/execution-receipt', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-csrf-token': csrf,
        },
        body: JSON.stringify({ authorizationId: authorization.id }),
        cache: 'no-store',
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error || 'Could not issue the execution receipt');
      setReceipt(body.receipt as ReceiptView);
      setAuthorization((current) => current ? { ...current, state: 'receipt_issued' } : current);
      toast.success('One-time execution receipt issued');
    } catch (receiptError) {
      const message = receiptError instanceof Error ? receiptError.message : 'Could not issue the execution receipt';
      setError(message);
      toast.error(message);
    } finally {
      setIssuingReceipt(false);
    }
  }, [authorization]);

  const groupedActions = React.useMemo(() => {
    if (!result) return [];
    return (Object.keys(PHASE_LABELS) as Array<keyof typeof PHASE_LABELS>)
      .map((phase) => ({
        phase,
        actions: result.plan.actions.filter((action) => action.phase === phase),
      }))
      .filter((group) => group.actions.length > 0);
  }, [result]);

  return (
    <div className="space-y-4 pb-10">
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-2xl font-bold md:text-3xl">Deployment Planner</h1>
            <Badge variant="secondary">Proposal v1</Badge>
          </div>
          <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
            Compile the saved Infrastructure Designer blueprint—including explicit OS, access, architecture, and resource intent—into a reviewable deployment contract. Authorization and execution receipts are explicit stages; this surface still never provisions AWS resources or changes live lab state.
          </p>
        </div>
        <Button onClick={() => void generatePlan()} disabled={loading || authorizing || issuingReceipt}>
          {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : result ? <RefreshCw className="mr-2 h-4 w-4" /> : <FileCog className="mr-2 h-4 w-4" />}
          {result ? 'Regenerate plan' : 'Generate deployment plan'}
        </Button>
      </div>

      {!result && !loading && (
        <div className="rounded-2xl border border-dashed bg-card p-10 text-center">
          <FileCog className="mx-auto h-10 w-10 text-muted-foreground/50" />
          <p className="mt-3 font-semibold">Blueprint → explicit proposal</p>
          <p className="mx-auto mt-1 max-w-2xl text-sm leading-6 text-muted-foreground">
            OXSIG will read your persisted blueprint, re-run validation on the server, identify workloads, runtime mappings, network functions, segments, links, and the ordered actions a future authorized deployment would require.
          </p>
        </div>
      )}

      {error && (
        <div className="rounded-2xl border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
          <div className="flex items-start gap-2"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" /><span>{error}</span></div>
        </div>
      )}

      {result && (
        <>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
            <Metric icon={Server} label="Workloads" value={result.plan.summary.workloads} />
            <Metric icon={Network} label="Network functions" value={result.plan.summary.networkFunctions} />
            <Metric icon={Network} label="Segments" value={result.plan.summary.segments} />
            <Metric icon={Network} label="Links" value={result.plan.summary.links} />
            <Metric icon={result.plan.readiness.executable ? CheckCircle2 : ShieldAlert} label="Planner readiness" value={result.plan.readiness.executable ? 'Ready' : 'Blocked'} />
          </div>

          <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
            <section className="space-y-4">
              <div className="rounded-2xl border bg-card p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <p className="font-semibold">Proposed execution sequence</p>
                    <p className="mt-1 text-xs text-muted-foreground">Nothing below executes automatically. Each action records whether the current runtime can perform it.</p>
                  </div>
                  <Badge variant="outline">{result.plan.actions.length} actions</Badge>
                </div>
              </div>

              {groupedActions.map((group) => (
                <div key={group.phase} className="overflow-hidden rounded-2xl border bg-card">
                  <div className="flex items-center justify-between border-b px-4 py-3">
                    <p className="text-sm font-semibold">{PHASE_LABELS[group.phase]}</p>
                    <Badge variant="outline" className="text-[10px]">{group.actions.length}</Badge>
                  </div>
                  <div className="divide-y">
                    {group.actions.map((action, index) => (
                      <div key={action.id} className="p-4">
                        <div className="flex items-start gap-3">
                          <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border bg-muted text-[10px] font-semibold">{index + 1}</div>
                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-center gap-2">
                              <p className="text-sm font-medium">{action.description}</p>
                              <Badge variant={action.executableNow ? 'default' : 'secondary'} className="text-[9px]">{action.executableNow ? 'Executable' : 'Proposal only'}</Badge>
                            </div>
                            {action.blocker && <p className="mt-1 text-xs leading-5 text-muted-foreground">{action.blocker}</p>}
                            <p className="mt-1 font-mono text-[10px] text-muted-foreground/70">{action.id}</p>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </section>

            <aside className="space-y-4">
              <div className="rounded-2xl border bg-card p-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Plan identity</p>
                <p className="mt-2 break-all font-mono text-xs">{result.planId}</p>
                <p className="mt-2 text-[11px] leading-5 text-muted-foreground">
                  Stable SHA-256 identity over the deterministic plan. Runtime profile selections are inside this identity, so approval binds to the exact OS/access/resource proposal instead of mutable client state.
                </p>
                <div className="mt-3 space-y-1 text-[10px] text-muted-foreground">
                  <p>Design saved: {new Date(result.sourceDesignUpdatedAt).toLocaleString()}</p>
                  <p>Plan generated: {new Date(result.generatedAt).toLocaleString()}</p>
                </div>
              </div>

              <div className="rounded-2xl border bg-card p-4">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2"><LockKeyhole className="h-4 w-4" /><p className="font-semibold">Authorization</p></div>
                  <Badge variant={authorization ? 'default' : 'outline'} className="text-[9px]">
                    {authorization ? authorization.state.replace('_', ' ') : 'Not authorized'}
                  </Badge>
                </div>
                <p className="mt-2 text-[11px] leading-5 text-muted-foreground">
                  Approval is server-side and bound to this exact plan hash. Changing the saved design invalidates it before a receipt can be issued.
                </p>

                {!authorization && (
                  <Button className="mt-3 w-full" variant="outline" onClick={() => void authorizePlan()} disabled={authorizing || loading}>
                    {authorizing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <LockKeyhole className="mr-2 h-4 w-4" />}
                    Authorize exact plan
                  </Button>
                )}

                {authorization && (
                  <div className="mt-3 space-y-3">
                    <div className="rounded-xl border p-3 text-[10px] text-muted-foreground">
                      <p className="break-all font-mono text-foreground">{authorization.id}</p>
                      <p className="mt-1">Expires: {new Date(authorization.expiresAt).toLocaleString()}</p>
                    </div>

                    {authorization.executionSupport.supported && authorization.executionSupport.target ? (
                      <div className="rounded-xl bg-emerald-500/10 p-3 text-xs leading-5 text-emerald-700 dark:text-emerald-300">
                        Controlled adapter available: <span className="font-mono">{authorization.executionSupport.target.labSlug}</span> · {authorization.executionSupport.target.accessMode}
                      </div>
                    ) : (
                      <div className="space-y-2">
                        <p className="text-xs font-medium">Execution adapter not ready for this plan</p>
                        {authorization.executionSupport.reasons.map((reason) => (
                          <div key={reason} className="rounded-xl bg-amber-500/10 p-3 text-[11px] leading-5 text-amber-700 dark:text-amber-300">{reason}</div>
                        ))}
                      </div>
                    )}

                    {authorization.state === 'authorized' && authorization.executionSupport.supported && !receipt && (
                      <Button className="w-full" onClick={() => void issueExecutionReceipt()} disabled={issuingReceipt}>
                        {issuingReceipt ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <KeyRound className="mr-2 h-4 w-4" />}
                        Issue one-time execution receipt
                      </Button>
                    )}
                  </div>
                )}

                {receipt && (
                  <div className="mt-3 rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-3">
                    <div className="flex items-center gap-2 text-xs font-semibold"><KeyRound className="h-3.5 w-3.5" />Receipt issued</div>
                    <p className="mt-2 break-all font-mono text-[10px]">{receipt.executionId}</p>
                    <p className="mt-2 text-[11px] leading-5 text-muted-foreground">
                      Reserved for {receipt.target.labSlug}. No VM, network, or AWS resource has been created or changed. The future execution adapter must consume this receipt before provider execution begins.
                    </p>
                  </div>
                )}
              </div>

              {result.plan.workloads.length > 0 && (
                <div className="rounded-2xl border bg-card p-4">
                  <div className="flex items-center justify-between gap-2"><p className="font-semibold">Runtime mappings</p><Badge variant="outline">{result.plan.workloads.length}</Badge></div>
                  <div className="mt-3 space-y-2">
                    {result.plan.workloads.map((workload) => {
                      const selected = workload.runtimeProfile === 'unspecified' ? null : workload.runtimeProfile;
                      const statusLabel = workload.runtimeAdapter.status === 'mapped-available'
                        ? 'Mapped'
                        : workload.runtimeAdapter.status === 'mapped-unavailable'
                          ? 'Unavailable'
                          : 'Unmapped';
                      return (
                        <div key={workload.nodeId} className="rounded-xl border p-3">
                          <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0"><p className="truncate text-xs font-semibold">{workload.label}</p><p className="mt-0.5 truncate text-[11px] text-muted-foreground">{workload.runtimeProfileLabel || 'Runtime profile not selected'}</p></div>
                            <Badge variant={workload.runtimeAdapter.status === 'mapped-available' ? 'default' : 'secondary'} className="text-[9px]">{statusLabel}</Badge>
                          </div>
                          {selected && <p className="mt-2 font-mono text-[10px] text-muted-foreground">{selected.architecture} · {selected.resourceClass} · {selected.accessMode}</p>}
                          {workload.runtimeAdapter.labSlug && <p className="mt-1 font-mono text-[10px] text-muted-foreground/70">{workload.runtimeAdapter.labSlug}</p>}
                          {workload.runtimeAdapter.note && <p className="mt-1 text-[10px] leading-4 text-muted-foreground">{workload.runtimeAdapter.note}</p>}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              <div className="rounded-2xl border bg-card p-4">
                <div className="flex items-center justify-between gap-2">
                  <p className="font-semibold">Execution blockers</p>
                  <Badge variant={result.plan.readiness.blockers.length ? 'destructive' : 'outline'}>{result.plan.readiness.blockers.length}</Badge>
                </div>
                <div className="mt-3 space-y-2">
                  {result.plan.readiness.blockers.map((blocker) => (
                    <div key={blocker} className="rounded-xl bg-destructive/8 p-3 text-xs leading-5 text-destructive"><ShieldAlert className="mr-1.5 inline h-3.5 w-3.5" />{blocker}</div>
                  ))}
                  {result.plan.readiness.blockers.length === 0 && <p className="text-xs text-muted-foreground">No blockers detected.</p>}
                </div>
              </div>

              <div className="rounded-2xl border bg-card p-4">
                <div className="flex items-center justify-between gap-2"><p className="font-semibold">Planner warnings</p><Badge variant="outline">{result.plan.readiness.warnings.length}</Badge></div>
                <div className="mt-3 space-y-2">
                  {result.plan.readiness.warnings.map((warning) => <div key={warning} className="rounded-xl bg-amber-500/10 p-3 text-xs leading-5 text-amber-700 dark:text-amber-300">{warning}</div>)}
                  {result.plan.readiness.warnings.length === 0 && <p className="text-xs text-muted-foreground">No non-blocking warnings.</p>}
                </div>
              </div>
            </aside>
          </div>
        </>
      )}
    </div>
  );
}

function Metric({ icon: Icon, label, value }: { icon: React.ComponentType<{ className?: string }>; label: string; value: React.ReactNode }) {
  return (
    <div className="rounded-2xl border bg-card p-4">
      <div className="flex items-center gap-2 text-xs text-muted-foreground"><Icon className="h-4 w-4" />{label}</div>
      <p className="mt-2 text-2xl font-semibold">{value}</p>
    </div>
  );
}
