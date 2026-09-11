'use client';

import * as React from 'react';
import Link from 'next/link';
import { ArrowRight, CheckCircle2, Compass, Loader2, Network, Play, ShieldCheck } from 'lucide-react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { getCsrfToken } from '@/lib/security/csrf-client';

type CapabilityState = {
  id: string;
  title: string;
  outcome: string;
  evidenceRequirement: string;
  practiceLabel: string;
  order: number;
  status: 'not_started' | 'in_progress' | 'demonstrated';
};

type PathState = {
  path: { id: string; version: number; title: string; description: string };
  enrollment: {
    status: string;
    activeCapabilityId: string | null;
    recommendedCapabilityId: string | null;
  } | null;
  demonstratedCount: number;
  totalCapabilities: number;
  progressPercent: number;
  capabilities: CapabilityState[];
};

export default function AcademyPathsPage() {
  const [paths, setPaths] = React.useState<PathState[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [busyPath, setBusyPath] = React.useState<string | null>(null);

  const loadPaths = React.useCallback(async () => {
    try {
      const response = await fetch('/api/learning/paths', { cache: 'no-store' });
      if (!response.ok) throw new Error('Could not load learning paths');
      const body = await response.json() as { paths?: PathState[] };
      setPaths(body.paths || []);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not load learning paths');
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => { void loadPaths(); }, [loadPaths]);

  async function startPath(pathId: string) {
    setBusyPath(pathId);
    try {
      const csrf = await getCsrfToken();
      const response = await fetch(`/api/learning/paths/${encodeURIComponent(pathId)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-csrf-token': csrf },
        body: JSON.stringify({ action: 'start' }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body?.error || 'Could not start learning path');
      window.location.assign('/academy');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not start learning path');
      setBusyPath(null);
    }
  }

  if (loading) {
    return <div className="flex min-h-[55vh] items-center justify-center text-sm text-muted-foreground"><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Loading learning paths…</div>;
  }

  return (
    <div className="mx-auto max-w-6xl space-y-5 py-4">
      <section className="rounded-2xl border bg-gradient-to-r from-primary/10 via-background to-cyan-500/10 p-5 sm:p-7">
        <Badge variant="secondary" className="mb-3 gap-1.5"><Compass className="h-3.5 w-3.5" /> Capability journeys</Badge>
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">Choose what you want to prove next.</h1>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">Curated paths connect explanation, live practice, reflection, and persisted evidence. Progress means demonstrated capability—not merely opening a lesson.</p>
      </section>

      <div className="grid gap-4 lg:grid-cols-2">
        {paths.map((state) => {
          const active = state.enrollment?.status === 'active';
          const isAd = state.path.id === 'active-directory-operations';
          const recommended = state.enrollment?.recommendedCapabilityId
            ? state.capabilities.find((capability) => capability.id === state.enrollment?.recommendedCapabilityId)
            : null;

          return (
            <Card key={state.path.id} className={active ? 'border-primary/40 shadow-sm' : ''}>
              <CardHeader>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <Badge variant={active ? 'default' : 'outline'}>{active ? 'Active journey' : `${state.totalCapabilities} capabilities`}</Badge>
                  {isAd ? <Badge variant="secondary" className="gap-1"><Network className="h-3 w-3" /> Black Domain runtime</Badge> : null}
                </div>
                <CardTitle>{state.path.title}</CardTitle>
                <CardDescription className="leading-5">{state.path.description}</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-medium">Evidence progress</span>
                    <span className="text-muted-foreground">{state.demonstratedCount}/{state.totalCapabilities} · {state.progressPercent}%</span>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full bg-primary" style={{ width: `${state.progressPercent}%` }} /></div>
                </div>

                <ol className="space-y-2">
                  {state.capabilities.map((capability) => (
                    <li key={capability.id} className="flex gap-2 rounded-lg border bg-muted/15 p-2.5">
                      {capability.status === 'demonstrated'
                        ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-500" />
                        : <span className="mt-0.5 grid h-4 w-4 shrink-0 place-items-center rounded-full border text-[9px] text-muted-foreground">{capability.order}</span>}
                      <div className="min-w-0">
                        <p className="text-xs font-medium">{capability.title}</p>
                        <p className="mt-0.5 line-clamp-2 text-[11px] leading-4 text-muted-foreground">{capability.outcome}</p>
                      </div>
                    </li>
                  ))}
                </ol>

                {recommended ? (
                  <div className="rounded-lg border border-primary/20 bg-primary/[0.04] p-3 text-xs">
                    <p className="font-medium">Next: {recommended.title}</p>
                    <p className="mt-1 text-muted-foreground">{recommended.practiceLabel}</p>
                  </div>
                ) : null}

                <div className="flex flex-wrap gap-2">
                  {active ? (
                    <Button asChild><Link href="/academy">Resume Academy <ArrowRight className="ml-2 h-4 w-4" /></Link></Button>
                  ) : (
                    <Button type="button" onClick={() => void startPath(state.path.id)} disabled={busyPath !== null}>
                      {busyPath === state.path.id ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Play className="mr-2 h-4 w-4" />}
                      Start path
                    </Button>
                  )}
                  {isAd ? (
                    <Button variant="outline" asChild>
                      <Link href={`/operations?operation=black-domain${recommended ? `&capability=${encodeURIComponent(recommended.id)}` : ''}`}><ShieldCheck className="mr-2 h-4 w-4" /> Open Black Domain</Link>
                    </Button>
                  ) : null}
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <div className="flex justify-end"><Button variant="ghost" asChild><Link href="/academy/explore">Explore a side topic <ArrowRight className="ml-2 h-4 w-4" /></Link></Button></div>
    </div>
  );
}
