'use client';

import * as React from 'react';
import Link from 'next/link';
import { ArrowRight, History, Loader2, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { getOperation } from '@/lib/operations/catalog';
import { getCsrfToken } from '@/lib/security/csrf-client';

type RunSummary = {
  id: string;
  operationSlug: string;
  mode: string;
  status: string;
  lifecycleState?: 'active' | 'paused';
  operatorLabInstanceId: string | null;
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

export function OperationRunRecovery({ compact = false, modeFilter }: Props) {
  const [runs, setRuns] = React.useState<RunSummary[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [busy, setBusy] = React.useState<string | null>(null);

  const load = React.useCallback(async () => {
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
  }, [compact]);

  React.useEffect(() => { void load(); }, [load]);

  const endRun = async (runId: string) => {
    if (!window.confirm('End and permanently destroy this Operation? All of its machines will be terminated.')) return;
    setBusy(runId);
    try {
      const csrf = await getCsrfToken();
      const response = await fetch(`/api/operations/runs/${encodeURIComponent(runId)}`, {
        method: 'DELETE',
        headers: { 'x-csrf-token': csrf },
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body?.error || 'Could not end Operation');
      toast.success('Destruction started for the Operation machines.');
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
  if (!loading && filtered.length === 0) return null;

  return (
    <Card className="bg-card/70">
      <CardContent className={compact ? 'p-3' : 'p-4'}>
        <div className="mb-2 flex items-center gap-2">
          <History className="h-4 w-4 text-primary" />
          <p className="text-xs font-semibold">{compact ? 'Active Operation' : 'Active & recent runs'}</p>
          {loading ? <Loader2 className="ml-auto h-3.5 w-3.5 animate-spin text-muted-foreground" /> : null}
        </div>

        <div className="space-y-2">
          {filtered.map((run) => {
            const operation = getOperation(run.operationSlug);
            const active = ACTIVE.has(run.status);
            const expired = runExpired(run);
            const paused = run.lifecycleState === 'paused' && active && !expired;
            const openable = active && !expired && run.status !== 'destroying';
            const endable = active && run.status !== 'destroying';
            const visibleStatus = expired ? 'expired' : paused ? 'paused' : run.status;
            return (
              <div key={run.id} className="flex flex-wrap items-center gap-2 rounded-lg border px-3 py-2">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="truncate text-xs font-semibold">{operation?.codename || run.operationSlug}</span>
                    <Badge variant={run.status === 'running' && !expired && !paused ? 'default' : 'outline'} className="h-5 text-[9px] capitalize">{visibleStatus}</Badge>
                    <Badge variant="secondary" className="h-5 text-[9px] capitalize">{run.mode}</Badge>
                  </div>
                  <p className="mt-1 text-[10px] text-muted-foreground">
                    {paused ? `Paused · ${expiryLabel(run.expiresAt) || 'session active'}` : active ? expiryLabel(run.expiresAt) || 'active' : `Started ${new Date(run.createdAt).toLocaleString()}`}
                  </p>
                </div>

                {openable && (
                  <Button asChild size="sm" variant="outline" className="h-8">
                    <Link href={resumeHref(run)}><ArrowRight className="mr-1.5 h-3.5 w-3.5" />Open</Link>
                  </Button>
                )}
                {endable && (
                  <Button size="sm" variant="ghost" className="h-8" onClick={() => void endRun(run.id)} disabled={busy === run.id}>
                    {busy === run.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                    {!compact ? <span className="ml-1.5">End &amp; destroy</span> : null}
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
