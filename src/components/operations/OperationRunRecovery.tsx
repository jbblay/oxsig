'use client';

import * as React from 'react';
import Link from 'next/link';
import { ArrowRight, History, Loader2, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { useAuth } from '@/lib/auth/use-auth';
import { getOperation } from '@/lib/operations/catalog';
import { finishReusableEnvironmentReset } from '@/lib/operations/reset-client';
import { getCsrfToken } from '@/lib/security/csrf-client';

type RunSummary = {
  id: string;
  operationSlug: string;
  mode: string;
  status: string;
  lifecycleState?: 'active' | 'paused';
  operatorLabInstanceId: string | null;
  learningCapabilityId?: string | null;
  expiresAt: string | null;
  lastError: string | null;
  createdAt: string;
  updatedAt: string;
};

type Props = {
  compact?: boolean;
  modeFilter?: string;
};

const ACTIVE = new Set(['provisioning', 'running', 'destroying']);

function resumeHref(run: RunSummary) {
  const destination = run.mode === 'warroom' ? '/warroom' : '/labs';
  const query = new URLSearchParams({
    operation: run.operationSlug,
    mode: run.mode,
    run: run.id,
  });
  if (run.learningCapabilityId) query.set('capability', run.learningCapabilityId);
  return `${destination}?${query.toString()}`;
}

function runExpired(run: RunSummary) {
  if (!run.expiresAt) return false;
  const expiresAt = new Date(run.expiresAt).getTime();
  return Number.isFinite(expiresAt) && expiresAt <= Date.now();
}

function expiryLabel(value: string | null) {
  if (!value) return null;
  const ms = new Date(value).getTime() - Date.now();
  if (!Number.isFinite(ms)) return null;
  if (ms <= 0) return 'expired';
  const minutes = Math.ceil(ms / 60_000);
  if (minutes < 60) return `${minutes}m left`;
  return `${Math.ceil(minutes / 60)}h left`;
}

export function OperationRunRecovery({ compact = true, modeFilter }: Props) {
  const { isAuthenticated, isLoading: authLoading } = useAuth();
  const [runs, setRuns] = React.useState<RunSummary[]>([]);
  const [loading, setLoading] = React.useState(false);
  const [busy, setBusy] = React.useState<string | null>(null);

  const load = React.useCallback(async () => {
    if (!isAuthenticated) {
      setRuns([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      const response = await fetch('/api/operations/runs', { cache: 'no-store' });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body?.error || 'Could not load Operation runs');
      setRuns((body.runs || []) as RunSummary[]);
    } catch (error) {
      if (!compact) toast.error(error instanceof Error ? error.message : 'Could not load Operation runs');
    } finally {
      setLoading(false);
    }
  }, [compact, isAuthenticated]);

  React.useEffect(() => {
    if (authLoading) return;
    if (!isAuthenticated) {
      setRuns([]);
      setLoading(false);
      return;
    }
    void load();
  }, [authLoading, isAuthenticated, load]);

  const endRun = async (runId: string) => {
    if (!window.confirm('End this Operation? Disposable machines are destroyed; reusable machines are restored to their clean baseline.')) return;
    setBusy(runId);
    try {
      const csrf = await getCsrfToken();
      const response = await fetch(`/api/operations/runs/${encodeURIComponent(runId)}`, {
        method: 'DELETE',
        headers: { 'x-csrf-token': csrf },
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body?.error || 'Could not end Operation');
      if (body?.reusableEnvironment && body?.reset) {
        toast.info('Operation ended. Restoring the reusable environment to its clean baseline.');
        await finishReusableEnvironmentReset({
          runId,
          csrfToken: csrf,
          initial: body.reset,
        });
        toast.success('Environment reset verified and returned to standby.');
      } else {
        toast.success('Destruction started for the Operation machines.');
      }
      await load();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not end Operation');
    } finally {
      setBusy(null);
    }
  };

  const filtered = runs.filter((run) => (
    (!modeFilter || run.mode === modeFilter)
    && (!compact || (ACTIVE.has(run.status) && !runExpired(run)))
  ));
  if (authLoading || (!loading && filtered.length === 0)) return null;

  return (
    <Card className={compact ? 'border-white/[0.08] bg-slate-950/70 text-slate-100 shadow-none' : 'bg-card/70'}>
      <CardContent className={compact ? 'p-2.5' : 'p-4'}>
        <div className={`${compact ? 'mb-1.5' : 'mb-2'} flex items-center gap-2`}>
          <History className={`h-4 w-4 ${compact ? 'text-cyan-300' : 'text-primary'}`} />
          <p className={`font-semibold ${compact ? 'font-mono text-[10px] uppercase tracking-[0.12em] text-slate-300' : 'text-xs'}`}>{compact ? 'Active Operation' : 'Active & recent runs'}</p>
          {loading ? <Loader2 className="ml-auto h-3.5 w-3.5 animate-spin text-muted-foreground" /> : null}
        </div>

        <div className="space-y-1.5">
          {filtered.map((run) => {
            const operation = getOperation(run.operationSlug);
            const active = ACTIVE.has(run.status);
            const expired = runExpired(run);
            const paused = run.lifecycleState === 'paused' && active && !expired;
            const openable = active && !expired && run.status !== 'destroying';
            const endable = active && run.status !== 'destroying';
            const visibleStatus = expired ? 'expired' : paused ? 'paused' : run.status;
            return (
              <div key={run.id} className={`flex flex-wrap items-center gap-2 rounded-lg border px-3 py-2 ${compact ? 'border-white/[0.07] bg-white/[0.025]' : ''}`}>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className={`truncate text-xs font-semibold ${compact ? 'text-slate-100' : ''}`}>{operation?.codename || run.operationSlug}</span>
                    <Badge variant={run.status === 'running' && !expired && !paused ? 'default' : 'outline'} className="h-5 text-[9px] capitalize">{visibleStatus}</Badge>
                    <Badge variant="secondary" className="h-5 text-[9px] capitalize">{run.mode}</Badge>
                  </div>
                  <p className={`mt-1 text-[10px] ${compact ? 'text-slate-500' : 'text-muted-foreground'}`}>
                    {paused ? `Paused · ${expiryLabel(run.expiresAt) || 'session active'}` : active ? expiryLabel(run.expiresAt) || 'active' : `Started ${new Date(run.createdAt).toLocaleString()}`}
                  </p>
                </div>

                {openable && (
                  <Button asChild size="sm" variant="outline" className={compact ? 'h-8 border-white/10 bg-white/[0.03] text-slate-200 hover:bg-white/[0.08] hover:text-white' : 'h-8'}>
                    <Link href={resumeHref(run)}><ArrowRight className="mr-1.5 h-3.5 w-3.5" />Open</Link>
                  </Button>
                )}
                {endable && (
                  <Button size="sm" variant="ghost" className={compact ? 'h-8 text-slate-500 hover:bg-red-500/10 hover:text-red-300' : 'h-8'} onClick={() => void endRun(run.id)} disabled={busy === run.id}>
                    {busy === run.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                    {!compact ? <span className="ml-1.5">End operation</span> : null}
                  </Button>
                )}
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
