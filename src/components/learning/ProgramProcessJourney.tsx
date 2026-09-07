'use client';

import * as React from 'react';
import Link from 'next/link';
import {
  ArrowRight,
  BrainCircuit,
  Check,
  ChevronDown,
  Circle,
  Loader2,
  Play,
  TerminalSquare,
} from 'lucide-react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { getCsrfToken } from '@/lib/security/csrf-client';
import { cn } from '@/lib/utils';

type CapabilityState = {
  id: string;
  title: string;
  outcome: string;
  evidenceRequirement: string;
  practiceLabel: string;
  order: number;
  status: 'not_started' | 'in_progress' | 'demonstrated';
  evidence: {
    practiceDemonstrated: boolean;
    reflectionDemonstrated: boolean;
    assessmentDemonstrated: boolean;
    bestReflectionScore: number | null;
  };
};

type PathState = {
  path: { id: string; version: number; title: string; description: string };
  enrollment: null | {
    id: string;
    status: string;
    activeCapabilityId: string | null;
    enrolledAt: string;
    lastActivityAt: string;
    completedAt: string | null;
  };
  demonstratedCount: number;
  totalCapabilities: number;
  progressPercent: number;
  capabilities: CapabilityState[];
};

function statusLabel(status: CapabilityState['status']) {
  if (status === 'demonstrated') return 'Demonstrated';
  if (status === 'in_progress') return 'In progress';
  return 'Not started';
}

export function ProgramProcessJourney({ isAuthenticated }: { isAuthenticated: boolean }) {
  const [state, setState] = React.useState<PathState | null>(null);
  const [loading, setLoading] = React.useState(isAuthenticated);
  const [starting, setStarting] = React.useState(false);
  const [selectedId, setSelectedId] = React.useState<string | null>(null);

  const load = React.useCallback(async () => {
    if (!isAuthenticated) return;
    setLoading(true);
    try {
      const response = await fetch('/api/learning/program-process', { cache: 'no-store' });
      if (!response.ok) throw new Error('OXSIG could not load your reference journey');
      const body = await response.json() as { state: PathState };
      setState(body.state);
      setSelectedId((current) => current || body.state.enrollment?.activeCapabilityId || body.state.capabilities[0]?.id || null);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Reference journey could not be loaded');
    } finally {
      setLoading(false);
    }
  }, [isAuthenticated]);

  React.useEffect(() => {
    void load();
  }, [load]);

  async function startJourney() {
    setStarting(true);
    try {
      const token = await getCsrfToken();
      const response = await fetch('/api/learning/program-process', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-csrf-token': token },
        body: JSON.stringify({ action: 'start' }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body?.error || 'OXSIG could not start this learning journey');
      setState(body.state as PathState);
      setSelectedId((body.state as PathState).enrollment?.activeCapabilityId || (body.state as PathState).capabilities[0]?.id || null);
      toast.success('Reference journey started with zero assumed progress.');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Reference journey could not be started');
    } finally {
      setStarting(false);
    }
  }

  if (!isAuthenticated) {
    return (
      <Card className="overflow-hidden border-sky-500/20">
        <CardContent className="p-6 sm:p-8">
          <Badge variant="secondary">Reference learning journey</Badge>
          <h2 className="mt-3 text-2xl font-semibold">How a Program Becomes a Process</h2>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">
            Sign in to begin the reference journey. OXSIG does not assume completion before you produce learning evidence.
          </p>
        </CardContent>
      </Card>
    );
  }

  if (loading && !state) {
    return <div className="h-80 animate-pulse rounded-3xl border bg-muted/30" aria-label="Loading reference journey" />;
  }

  if (!state) return null;

  const enrolled = Boolean(state.enrollment);
  const selected = state.capabilities.find((capability) => capability.id === selectedId) || state.capabilities[0];

  return (
    <section className="overflow-hidden rounded-3xl border bg-[radial-gradient(circle_at_top_right,rgba(14,165,233,0.13),transparent_34%),linear-gradient(145deg,hsl(var(--background)),hsl(var(--muted)/0.25))] shadow-sm">
      <div className="border-b p-5 sm:p-6 lg:p-8">
        <div className="flex flex-wrap items-start justify-between gap-5">
          <div className="max-w-3xl">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="secondary" className="gap-1.5"><BrainCircuit className="h-3.5 w-3.5" /> Core reference journey</Badge>
              <Badge variant="outline">v{state.path.version}</Badge>
            </div>
            <h2 className="mt-3 text-2xl font-semibold tracking-tight sm:text-3xl">{state.path.title}</h2>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">{state.path.description}</p>
          </div>
          <div className="min-w-[190px] rounded-2xl border bg-background/70 p-4 backdrop-blur">
            <div className="flex items-end justify-between gap-3">
              <div><p className="text-[10px] font-semibold uppercase tracking-[0.15em] text-muted-foreground">Demonstrated</p><p className="mt-1 text-2xl font-semibold">{state.demonstratedCount}<span className="text-sm font-normal text-muted-foreground">/{state.totalCapabilities}</span></p></div>
              <p className="text-lg font-semibold">{state.progressPercent}%</p>
            </div>
            <div className="mt-3 h-2 overflow-hidden rounded-full bg-muted">
              <div className="h-full rounded-full bg-emerald-500 transition-[width] duration-700" style={{ width: `${state.progressPercent}%` }} />
            </div>
            <p className="mt-2 text-[10px] leading-4 text-muted-foreground">Only demonstrated capability moves this bar.</p>
          </div>
        </div>

        <div className="mt-5 flex flex-wrap gap-2">
          {!enrolled ? (
            <Button onClick={() => void startJourney()} disabled={starting}>
              {starting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
              {starting ? 'Starting…' : 'Start with zero assumed progress'}
            </Button>
          ) : (
            <Button asChild><Link href="/academy"><Play className="h-4 w-4" /> Continue in Academy</Link></Button>
          )}
          <Button variant="outline" asChild><Link href="/labs"><TerminalSquare className="h-4 w-4" /> Open Cyber Lab</Link></Button>
        </div>
      </div>

      <div className="grid lg:grid-cols-[0.78fr_1.22fr]">
        <div className="border-b p-4 sm:p-5 lg:border-b-0 lg:border-r">
          <p className="px-2 text-[10px] font-semibold uppercase tracking-[0.17em] text-muted-foreground">Capability map</p>
          <div className="mt-3 space-y-0">
            {state.capabilities.map((capability, index) => {
              const active = capability.id === selected?.id;
              const demonstrated = capability.status === 'demonstrated';
              const inProgress = capability.status === 'in_progress';
              return (
                <div key={capability.id} className="relative">
                  {index < state.capabilities.length - 1 && (
                    <div className={cn('absolute left-[27px] top-12 h-[calc(100%-24px)] w-0.5', demonstrated ? 'bg-emerald-500/65' : 'bg-border')} />
                  )}
                  <button
                    type="button"
                    onClick={() => setSelectedId(capability.id)}
                    className={cn(
                      'relative z-10 flex w-full items-center gap-3 rounded-2xl p-2.5 text-left transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                      active ? 'bg-background shadow-sm ring-1 ring-border' : 'hover:bg-background/60'
                    )}
                    aria-expanded={active}
                  >
                    <span className={cn(
                      'flex h-9 w-9 shrink-0 items-center justify-center rounded-full border bg-background transition-all',
                      demonstrated && 'border-emerald-500/50 bg-emerald-500/15 text-emerald-600',
                      inProgress && 'border-sky-500/55 bg-sky-500/10 text-sky-600 shadow-[0_0_20px_-10px_rgba(14,165,233,0.85)]'
                    )}>
                      {demonstrated ? <Check className="h-4 w-4" /> : inProgress ? <span className="h-2.5 w-2.5 rounded-full bg-sky-500 motion-safe:animate-pulse" /> : <Circle className="h-3.5 w-3.5" />}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium">{capability.order}. {capability.title}</span>
                      <span className={cn('mt-0.5 block text-[10px]', demonstrated ? 'text-emerald-600' : inProgress ? 'text-sky-600' : 'text-muted-foreground')}>{statusLabel(capability.status)}</span>
                    </span>
                    <ChevronDown className={cn('h-4 w-4 shrink-0 text-muted-foreground transition-transform', active && 'rotate-180')} />
                  </button>
                </div>
              );
            })}
          </div>
        </div>

        {selected && (
          <div key={selected.id} className="p-5 sm:p-6 lg:p-8 motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-bottom-1 motion-safe:duration-300">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">Capability {selected.order}</p>
                <h3 className="mt-1 text-xl font-semibold">{selected.title}</h3>
              </div>
              <Badge variant={selected.status === 'demonstrated' ? 'default' : 'outline'} className={selected.status === 'demonstrated' ? 'bg-emerald-600' : ''}>{statusLabel(selected.status)}</Badge>
            </div>

            <div className="mt-5 grid gap-3 sm:grid-cols-2">
              <div className="rounded-2xl border bg-background/65 p-4">
                <p className="text-xs font-semibold">What you must understand</p>
                <p className="mt-2 text-sm leading-6 text-muted-foreground">{selected.outcome}</p>
              </div>
              <div className="rounded-2xl border bg-background/65 p-4">
                <p className="text-xs font-semibold">What counts as evidence</p>
                <p className="mt-2 text-sm leading-6 text-muted-foreground">{selected.evidenceRequirement}</p>
              </div>
            </div>

            <div className="mt-4 rounded-2xl border bg-muted/20 p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div><p className="text-xs font-semibold">Evidence state</p><p className="mt-1 text-xs text-muted-foreground">Reading or clicking complete does not satisfy this capability.</p></div>
                <Badge variant="secondary">{selected.practiceLabel}</Badge>
              </div>
              <div className="mt-4 grid gap-2 sm:grid-cols-3">
                <div className={cn('rounded-xl border p-3 text-xs', selected.evidence.practiceDemonstrated && 'border-emerald-500/30 bg-emerald-500/5')}><p className="font-medium">Practical result</p><p className="mt-1 text-muted-foreground">{selected.evidence.practiceDemonstrated ? 'Passed with persisted execution evidence' : 'Not demonstrated yet'}</p></div>
                <div className={cn('rounded-xl border p-3 text-xs', selected.evidence.reflectionDemonstrated && 'border-emerald-500/30 bg-emerald-500/5')}><p className="font-medium">Explain-back</p><p className="mt-1 text-muted-foreground">{selected.evidence.reflectionDemonstrated ? `Demonstrated${selected.evidence.bestReflectionScore !== null ? ` · ${selected.evidence.bestReflectionScore}%` : ''}` : 'Not demonstrated yet'}</p></div>
                <div className={cn('rounded-xl border p-3 text-xs', selected.evidence.assessmentDemonstrated && 'border-emerald-500/30 bg-emerald-500/5')}><p className="font-medium">Prove what you know</p><p className="mt-1 text-muted-foreground">{selected.evidence.assessmentDemonstrated ? 'Assessment demonstrated' : 'No bypass assessment recorded'}</p></div>
              </div>
            </div>

            {enrolled && (
              <Button asChild className="mt-5"><Link href="/academy">Work on this capability <ArrowRight className="h-4 w-4" /></Link></Button>
            )}
          </div>
        )}
      </div>
    </section>
  );
}
