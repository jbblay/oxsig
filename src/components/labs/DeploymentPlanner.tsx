'use client';

import * as React from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  CloudCog,
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

type PlanResponse = {
  planId: string;
  planHash: string;
  sourceDesignUpdatedAt: string;
  generatedAt: string;
  plan: DeploymentPlan;
  executionSupport: ExecutionSupport;
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

type DeploymentView = {
  executionId: string;
  authorizationId: string;
  alreadyStarted: boolean;
  instance: {
    id: string;
    slug: string;
    name: string;
    status: string;
    expiresAt: string;
    metadata: Record<string, unknown>;
  };
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
  const [deployment, setDeployment] = React.useState<DeploymentView | null>(null);
  const [authorizing, setAuthorizing] = React.useState(false);
  const [issuingReceipt, setIssuingReceipt] = React.useState(false);
  const [startingDeployment, setStartingDeployment] = React.useState(false);

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
      setDeployment(null);
    } catch (planError) {
      const message = planError instanceof Error ? planError.message : 'Could not generate a deployment plan';
      setError(message);
      toast.error(message);
    } finally {
      setLoading(false);
    }
  }, []);

  const authorizePlan = React.useCallback(async () => {
    if (!result || !result.executionSupport.supported) return;
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
      setDeployment(null);
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
      setDeployment(null);
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

  const startControlledDeployment = React.useCallback(async () => {
    if (!receipt || !authorization) return;
    const approved = window.confirm(
      `Start a real cloud lab for ${receipt.target.labSlug}? This creates provider infrastructure and may incur cloud cost until the lab is destroyed or expires.`
    );
    if (!approved) return;

    setStartingDeployment(true);
    setError(null);
    try {
      const csrf = await getCsrfToken();
      const response = await fetch('/api/labs/infrastructure-plan/execute', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-csrf-token': csrf,
        },
        body: JSON.stringify({
          authorizationId: receipt.authorizationId,
          executionId: receipt.executionId,
        }),
        cache: 'no-store',
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error || 'Could not start the controlled deployment');
      setDeployment(body as DeploymentView);
      setAuthorization((current) => current ? { ...current, state: 'executing' } : current);
      toast.success(body.alreadyStarted ? 'Deployment was already started' : 'Controlled cloud deployment started');
    } catch (deploymentError) {
      const message = deploymentError instanceof Error ? deploymentError.message : 'Could not start the controlled deployment';
      setError(message);
      toast.error(message);
    } finally {
      setStartingDeployment(false);
    }
  }, [authorization, receipt]);

  const groupedActions = React.useMemo(() => {
    if (!result) return [];
    return (Object.keys(PHASE_LABELS) as Array<keyof typeof PHASE_LABELS>)
      .map((phase) => ({
        phase,
        actions: result.plan.actions.filter((action) => action.phase === phase),
      }))
      .filter((group) => group.actions.length > 0);
  }, [result]);

  const busy = loading || authorizing || issuingReceipt || startingDeployment;

  return (
    <div className="space-y-3 pb-2">
      <div className="flex justify-end">
        <Button onClick={() => void generatePlan()} disabled={busy || Boolean(deployment)}>
{loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : result ? <RefreshCw className="mr-2 h-4 w-4" /> : <FileCog className="mr-2 h-4 w-4" />}
{result ? 'Regenerate plan' : 'Generate plan'}
        </Button>
      </div>

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
            <Metric icon={result.executionSupport.supported ? CheckCircle2 : ShieldAlert} label="Controlled adapter" value={result.executionSupport.supported ? 'Available' : 'Design-only'} />
          </div>

          <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
            <section className="space-y-4">
              <div className="rounded-2xl border bg-card p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <p className="font-semibold">Proposed execution sequence</p>
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
                <div className="mt-3 space-y-1 text-[10px] text-muted-foreground">
                  <p>Design saved: {new Date(result.sourceDesignUpdatedAt).toLocaleString()}</p>
                  <p>Plan generated: {new Date(result.generatedAt).toLocaleString()}</p>
                </div>
              </div>

              <div className="rounded-2xl border bg-card p-4">
                <div className="flex items-center justify-between gap-2">
                  <p className="font-semibold">Controlled adapter scope</p>
                  <Badge variant={result.executionSupport.supported ? 'default' : 'secondary'} className="text-[9px]">
                    {result.executionSupport.supported ? 'Available' : 'Design-only'}
                  </Badge>
                </div>
                {result.executionSupport.supported && result.executionSupport.target ? (
                  <div className="mt-3 rounded-xl bg-emerald-500/10 p-3 text-xs leading-5 text-emerald-700 dark:text-emerald-300">
<span className="font-mono">{result.executionSupport.target.labSlug}</span> · {result.executionSupport.target.accessMode}
                  </div>
                ) : (
                  <div className="mt-3 space-y-2">
                    {result.executionSupport.reasons.map((reason) => (
                      <div key={reason} className="rounded-xl bg-amber-500/10 p-3 text-[11px] leading-5 text-amber-700 dark:text-amber-300">{reason}</div>
                    ))}
                  </div>
                )}
              </div>

              <div className="rounded-2xl border bg-card p-4">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2"><LockKeyhole className="h-4 w-4" /><p className="font-semibold">Authorization</p></div>
                  <Badge variant={authorization ? 'default' : 'outline'} className="text-[9px]">
                    {authorization ? authorization.state.replace('_', ' ') : 'Not authorized'}
                  </Badge>
                </div>
                <p className="mt-2 text-[11px] leading-5 text-muted-foreground">
                  Only a plan inside the current controlled adapter scope can be authorized for provider execution. Approval is server-side and bound to this exact plan hash; changing the saved design invalidates the authorization or receipt before provider execution.
                </p>

                {!authorization && (
                  <Button className="mt-3 w-full" variant="outline" onClick={() => void authorizePlan()} disabled={busy || !result.executionSupport.supported}>
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
                        Authorized adapter: <span className="font-mono">{authorization.executionSupport.target.labSlug}</span> · {authorization.executionSupport.target.accessMode}
                      </div>
                    ) : (
                      <div className="space-y-2">
                        <p className="text-xs font-medium">Authorized adapter contract is no longer executable</p>
                        {authorization.executionSupport.reasons.map((reason) => (
                          <div key={reason} className="rounded-xl bg-amber-500/10 p-3 text-[11px] leading-5 text-amber-700 dark:text-amber-300">{reason}</div>
                        ))}
                      </div>
                    )}

                    {authorization.state === 'authorized' && authorization.executionSupport.supported && !receipt && (
                      <Button className="w-full" onClick={() => void issueExecutionReceipt()} disabled={busy}>
                        {issuingReceipt ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <KeyRound className="mr-2 h-4 w-4" />}
                        Issue one-time execution receipt
                      </Button>
                    )}
                  </div>
                )}

                {receipt && !deployment && (
                  <div className="mt-3 rounded-xl border border-amber-500/30 bg-amber-500/5 p-3">
                    <div className="flex items-center gap-2 text-xs font-semibold"><KeyRound className="h-3.5 w-3.5" />Receipt issued</div>
                    <p className="mt-2 break-all font-mono text-[10px]">{receipt.executionId}</p>
                    <p className="mt-2 text-[11px] leading-5 text-muted-foreground">
                      Reserved for {receipt.target.labSlug}. No provider resource exists yet. Starting the controlled deployment below creates a real cloud VM and can incur provider cost until it is destroyed or expires.
                    </p>
                    <Button className="mt-3 w-full" variant="destructive" onClick={() => void startControlledDeployment()} disabled={busy}>
                      {startingDeployment ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <CloudCog className="mr-2 h-4 w-4" />}
                      Start real cloud VM
                    </Button>
                  </div>
                )}

                {deployment && (
                  <div className="mt-3 rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-3">
                    <div className="flex items-center gap-2 text-xs font-semibold"><CloudCog className="h-3.5 w-3.5" />Controlled deployment started</div>
                    <p className="mt-2 font-mono text-[10px]">Lab {deployment.instance.id}</p>
                    <p className="mt-1 text-[11px] text-muted-foreground">{deployment.instance.name} · {deployment.instance.status}</p>
                    <p className="mt-2 text-[11px] leading-5 text-muted-foreground">
                      The receipt is consumed and bound to this lab allocation. Switch to Runtime Lab to observe cloud state, open terminal/desktop access when ready, and manage lifecycle.
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
                  {result.plan.readiness.blockers.length === 0 && <p className="text-xs text-muted-foreground">No adapter blockers detected. Authorization and a one-time receipt are still required before provider execution.</p>}
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
