'use client';

import * as React from 'react';
import Link from 'next/link';
import {
  ArrowRight,
  BrainCircuit,
  Check,
  ChevronDown,
  Circle,
  FlaskConical,
  Loader2,
  MessageSquareText,
  Play,
  ShieldCheck,
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
    recommendedCapabilityId: string | null;
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

function EvidenceNode({
  title,
  detail,
  active,
  icon,
  position,
}: {
  title: string;
  detail: string;
  active: boolean;
  icon: React.ReactNode;
  position: string;
}) {
  return (
    <div className={cn('absolute z-20 w-[132px] -translate-x-1/2 -translate-y-1/2 sm:w-[150px]', position)}>
      <div className={cn(
        'rounded-2xl border bg-background/95 p-3 text-center shadow-sm backdrop-blur transition-all duration-700',
        active
          ? 'border-emerald-500/45 bg-emerald-500/10 shadow-[0_0_30px_-14px_rgba(16,185,129,0.85)]'
          : 'border-border/80 text-muted-foreground'
      )}>
        <span className={cn(
          'mx-auto flex h-8 w-8 items-center justify-center rounded-full border transition-all duration-700',
          active ? 'border-emerald-500/45 bg-emerald-500/15 text-emerald-600' : 'bg-muted/40'
        )}>{active ? <Check className="h-4 w-4" /> : icon}</span>
        <p className="mt-2 text-xs font-semibold text-foreground">{title}</p>
        <p className="mt-1 text-[10px] leading-4 text-muted-foreground">{detail}</p>
      </div>
    </div>
  );
}

function EvidenceConnector({ active, className }: { active: boolean; className: string }) {
  return (
    <div className={cn('absolute left-1/2 top-1/2 z-0 h-0.5 origin-left bg-border transition-colors duration-700', className, active && 'bg-emerald-500/65')}>
      {active && <span className="absolute right-0 top-1/2 h-2 w-2 -translate-y-1/2 rounded-full bg-emerald-500 motion-safe:animate-pulse" />}
    </div>
  );
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
      setSelectedId((current) => current || body.state.enrollment?.recommendedCapabilityId || body.state.enrollment?.activeCapabilityId || body.state.capabilities[0]?.id || null);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Reference journey could not be loaded');
    } finally {
      setLoading(false);
    }
  }, [isAuthenticated]);

  React.useEffect(() => { void load(); }, [load]);

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
      const nextState = body.state as PathState;
      setState(nextState);
      setSelectedId(nextState.enrollment?.recommendedCapabilityId || nextState.enrollment?.activeCapabilityId || nextState.capabilities[0]?.id || null);
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
          <p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">Sign in to begin the reference journey. OXSIG does not assume completion before you produce learning evidence.</p>
        </CardContent>
      </Card>
    );
  }

  if (loading && !state) return <div className="h-80 animate-pulse rounded-3xl border bg-muted/30" aria-label="Loading reference journey" />;
  if (!state) return null;

  const enrolled = Boolean(state.enrollment);
  const selected = state.capabilities.find((capability) => capability.id === selectedId) || state.capabilities[0];
  const selectedIndex = state.capabilities.findIndex((capability) => capability.id === selected?.id);
  const nextCapability = selectedIndex >= 0 ? state.capabilities[selectedIndex + 1] || null : null;
  const normalEvidenceComplete = Boolean(selected?.evidence.practiceDemonstrated && selected?.evidence.reflectionDemonstrated);
  const capabilityComplete = selected?.status === 'demonstrated';

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
            <div className="mt-3 h-2 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full bg-emerald-500 transition-[width] duration-700" style={{ width: `${state.progressPercent}%` }} /></div>
            <p className="mt-2 text-[10px] leading-4 text-muted-foreground">Only demonstrated capability moves this bar.</p>
          </div>
        </div>

        <div className="mt-5 flex flex-wrap gap-2">
          {!enrolled ? (
            <Button onClick={() => void startJourney()} disabled={starting}>{starting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}{starting ? 'Starting…' : 'Start with zero assumed progress'}</Button>
          ) : (
            <Button asChild><Link href="/academy"><Play className="h-4 w-4" /> Continue in Academy</Link></Button>
          )}
          {enrolled && <Button variant="outline" asChild><Link href="/academy/prove"><ShieldCheck className="h-4 w-4" /> Prove what I know</Link></Button>}
          <Button variant="outline" asChild><Link href="/labs"><TerminalSquare className="h-4 w-4" /> Open Cyber Lab</Link></Button>
        </div>
      </div>

      <div className="grid lg:grid-cols-[0.7fr_1.3fr]">
        <div className="border-b p-4 sm:p-5 lg:border-b-0 lg:border-r">
          <p className="px-2 text-[10px] font-semibold uppercase tracking-[0.17em] text-muted-foreground">Capability map</p>
          <div className="mt-3 space-y-0">
            {state.capabilities.map((capability, index) => {
              const active = capability.id === selected?.id;
              const demonstrated = capability.status === 'demonstrated';
              const recommended = state.enrollment?.recommendedCapabilityId === capability.id;
              const inProgress = capability.status === 'in_progress';
              return (
                <div key={capability.id} className="relative">
                  {index < state.capabilities.length - 1 && (
                    <div className={cn('absolute left-[27px] top-12 h-[calc(100%-24px)] w-0.5 overflow-hidden bg-border transition-colors duration-700', demonstrated && 'bg-emerald-500/60')}>
                      {demonstrated && <span className="absolute left-0 top-0 h-8 w-full bg-emerald-300/70 motion-safe:animate-[pulse_1.6s_ease-in-out_infinite]" />}
                    </div>
                  )}
                  <button
                    type="button"
                    onClick={() => setSelectedId(capability.id)}
                    className={cn('relative z-10 flex w-full items-center gap-3 rounded-2xl p-2.5 text-left transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring', active ? 'bg-background shadow-sm ring-1 ring-border' : 'hover:bg-background/60')}
                    aria-expanded={active}
                  >
                    <span className={cn(
                      'flex shrink-0 items-center justify-center rounded-full border bg-background transition-all duration-500',
                      active ? 'h-11 w-11' : 'h-9 w-9',
                      demonstrated && 'border-emerald-500/50 bg-emerald-500/15 text-emerald-600 shadow-[0_0_20px_-10px_rgba(16,185,129,0.9)]',
                      (inProgress || recommended) && !demonstrated && 'border-sky-500/55 bg-sky-500/10 text-sky-600 shadow-[0_0_20px_-10px_rgba(14,165,233,0.85)]'
                    )}>
                      {demonstrated ? <Check className="h-4 w-4" /> : inProgress || recommended ? <span className="h-2.5 w-2.5 rounded-full bg-sky-500 motion-safe:animate-pulse" /> : <Circle className="h-3.5 w-3.5" />}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium">{capability.order}. {capability.title}</span>
                      <span className={cn('mt-0.5 block text-[10px]', demonstrated ? 'text-emerald-600' : inProgress || recommended ? 'text-sky-600' : 'text-muted-foreground')}>{recommended && !demonstrated ? 'Recommended next' : statusLabel(capability.status)}</span>
                    </span>
                    <ChevronDown className={cn('h-4 w-4 shrink-0 text-muted-foreground transition-transform duration-300', active && 'rotate-180')} />
                  </button>
                </div>
              );
            })}
          </div>
        </div>

        {selected && (
          <div key={selected.id} className="p-5 sm:p-6 lg:p-8 motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-bottom-1 motion-safe:duration-300">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div><p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">Capability {selected.order}</p><h3 className="mt-1 text-xl font-semibold">{selected.title}</h3></div>
              <Badge variant={capabilityComplete ? 'default' : 'outline'} className={capabilityComplete ? 'bg-emerald-600' : ''}>{statusLabel(selected.status)}</Badge>
            </div>

            <div className="relative mx-auto mt-5 h-[390px] max-w-[640px] overflow-hidden rounded-3xl border bg-[radial-gradient(circle_at_center,rgba(14,165,233,0.09),transparent_48%)] sm:h-[430px]">
              <div className="absolute inset-0 opacity-60 [background-image:radial-gradient(circle_at_center,hsl(var(--border))_1px,transparent_1px)] [background-size:22px_22px]" />
              <EvidenceConnector active={selected.evidence.practiceDemonstrated} className="w-[31%] -rotate-[146deg] sm:w-[34%]" />
              <EvidenceConnector active={selected.evidence.reflectionDemonstrated} className="w-[31%] -rotate-[34deg] sm:w-[34%]" />
              <EvidenceConnector active={selected.evidence.assessmentDemonstrated} className="w-[28%] rotate-90 sm:w-[31%]" />

              <div className={cn(
                'absolute left-1/2 top-1/2 z-10 flex h-32 w-32 -translate-x-1/2 -translate-y-1/2 flex-col items-center justify-center rounded-full border-2 bg-background p-4 text-center shadow-xl transition-all duration-700 sm:h-40 sm:w-40',
                capabilityComplete
                  ? 'border-emerald-500/55 bg-emerald-500/10 shadow-[0_0_48px_-18px_rgba(16,185,129,0.95)]'
                  : 'border-sky-500/45 bg-sky-500/5 shadow-[0_0_48px_-18px_rgba(14,165,233,0.8)]'
              )}>
                <span className={cn('flex h-9 w-9 items-center justify-center rounded-full', capabilityComplete ? 'bg-emerald-500/15 text-emerald-600' : 'bg-sky-500/15 text-sky-600')}>
                  {capabilityComplete ? <Check className="h-5 w-5" /> : <BrainCircuit className="h-5 w-5" />}
                </span>
                <p className="mt-2 text-xs font-semibold sm:text-sm">{selected.title}</p>
                <p className="mt-1 hidden text-[10px] text-muted-foreground sm:block">{capabilityComplete ? 'Capability demonstrated' : 'Build and prove this mental model'}</p>
              </div>

              <EvidenceNode
                title="Practical evidence"
                detail={selected.evidence.practiceDemonstrated ? 'Real checkpoint passed' : selected.practiceLabel}
                active={selected.evidence.practiceDemonstrated}
                icon={<FlaskConical className="h-4 w-4" />}
                position="left-[21%] top-[24%]"
              />
              <EvidenceNode
                title="Explain-back"
                detail={selected.evidence.reflectionDemonstrated ? `Demonstrated${selected.evidence.bestReflectionScore !== null ? ` · ${selected.evidence.bestReflectionScore}%` : ''}` : 'Explain what the evidence means'}
                active={selected.evidence.reflectionDemonstrated}
                icon={<MessageSquareText className="h-4 w-4" />}
                position="left-[79%] top-[24%]"
              />
              <EvidenceNode
                title="Prove what I know"
                detail={selected.evidence.assessmentDemonstrated ? 'Assessment demonstrated' : selected.evidence.practiceDemonstrated ? 'Assessment unlocked' : 'Practical evidence required'}
                active={selected.evidence.assessmentDemonstrated}
                icon={<ShieldCheck className="h-4 w-4" />}
                position="left-1/2 top-[82%]"
              />

              {capabilityComplete && nextCapability && (
                <div className="absolute bottom-3 right-3 z-30 flex items-center gap-2 rounded-full border border-emerald-500/30 bg-background/95 px-3 py-2 text-[10px] font-medium text-emerald-700 shadow-sm motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-left-2">
                  <Check className="h-3.5 w-3.5" /> Next opens: {nextCapability.title}
                </div>
              )}
            </div>

            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <div className="rounded-2xl border bg-background/65 p-4"><p className="text-xs font-semibold">Mental model target</p><p className="mt-2 text-sm leading-6 text-muted-foreground">{selected.outcome}</p></div>
              <div className="rounded-2xl border bg-background/65 p-4"><p className="text-xs font-semibold">Evidence requirement</p><p className="mt-2 text-sm leading-6 text-muted-foreground">{selected.evidenceRequirement}</p></div>
            </div>

            <div className="mt-4 rounded-2xl border bg-muted/20 p-4">
              <p className="text-xs font-semibold">How this capability advances</p>
              <p className="mt-1 text-xs leading-5 text-muted-foreground">
                {capabilityComplete
                  ? selected.evidence.assessmentDemonstrated
                    ? 'You demonstrated this capability through the evidence-based assessment route.'
                    : normalEvidenceComplete
                      ? 'The practical checkpoint and explain-back are both demonstrated.'
                      : 'Persisted evidence marks this capability demonstrated.'
                  : 'Reading or clicking through material never completes this capability. Normal progression requires practical evidence plus explain-back; experienced learners may use assessment after the practical checkpoint.'}
              </p>
            </div>

            {enrolled && (
              <div className="mt-5 flex flex-wrap gap-2">
                <Button asChild><Link href="/academy">Work on this capability <ArrowRight className="h-4 w-4" /></Link></Button>
                {!capabilityComplete && <Button variant="outline" asChild><Link href="/academy/prove"><ShieldCheck className="h-4 w-4" /> Prove what I know</Link></Button>}
              </div>
            )}
          </div>
        )}
      </div>
    </section>
  );
}