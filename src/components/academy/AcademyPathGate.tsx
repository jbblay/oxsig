'use client';

import * as React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ArrowRight, BrainCircuit, Compass, Loader2, Play } from 'lucide-react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { getCsrfToken } from '@/lib/security/csrf-client';

const REFERENCE_TITLE = 'How a Program Becomes a Process';

type PathState = {
  path: { title: string; description: string; version: number };
  enrollment: null | {
    status: 'active' | 'completed' | 'abandoned';
    activeCapabilityId: string | null;
    recommendedCapabilityId: string | null;
  };
  demonstratedCount: number;
  totalCapabilities: number;
  progressPercent: number;
  capabilities: Array<{
    id: string;
    title: string;
    status: 'not_started' | 'in_progress' | 'demonstrated';
  }>;
};

export default function AcademyPathGate({
  children,
  activeCourseTitle,
}: {
  children: React.ReactNode;
  activeCourseTitle: string | null;
}) {
  const pathname = usePathname();
  const [state, setState] = React.useState<PathState | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [starting, setStarting] = React.useState(false);
  const [showLegacyMaterial, setShowLegacyMaterial] = React.useState(false);

  React.useEffect(() => {
    if (pathname === '/academy/explore') {
      setLoading(false);
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const response = await fetch('/api/learning/program-process', { cache: 'no-store' });
        if (!response.ok) throw new Error('Academy could not load your learning journey');
        const body = await response.json() as { state: PathState };
        if (!cancelled) setState(body.state);
      } catch (error) {
        if (!cancelled) toast.error(error instanceof Error ? error.message : 'Learning journey could not be loaded');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [pathname]);

  async function startOrResumeReferenceJourney() {
    setStarting(true);
    try {
      const token = await getCsrfToken();
      const response = await fetch('/api/learning/program-process', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-csrf-token': token },
        body: JSON.stringify({ action: 'start' }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body?.error || 'Academy could not open the reference journey');
      window.location.reload();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Reference journey could not be opened');
      setStarting(false);
    }
  }

  if (pathname === '/academy/explore') return <>{children}</>;

  if (loading && !state) {
    return <div className="mx-auto flex min-h-[60vh] max-w-5xl items-center justify-center text-sm text-muted-foreground"><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Loading your Academy journey…</div>;
  }

  if (!state) return <>{children}</>;

  const enrolled = state.enrollment?.status === 'active';
  const previouslyEnrolled = Boolean(state.enrollment);
  const referenceCourseActive = activeCourseTitle === REFERENCE_TITLE;
  const nextCapability = state.capabilities.find((capability) => capability.id === state.enrollment?.recommendedCapabilityId)
    || state.capabilities.find((capability) => capability.status !== 'demonstrated')
    || null;

  if (referenceCourseActive && enrolled) {
    return (
      <div className="space-y-4">
        <div className="mx-auto flex max-w-[1800px] flex-wrap items-center justify-between gap-3 rounded-2xl border bg-muted/20 px-4 py-3">
          <div className="flex min-w-0 items-center gap-3">
            <BrainCircuit className="h-5 w-5 shrink-0 text-primary" />
            <div className="min-w-0">
              <p className="text-sm font-semibold">Core journey · {state.path.title}</p>
              <p className="text-xs text-muted-foreground">{state.demonstratedCount}/{state.totalCapabilities} capabilities demonstrated{nextCapability ? ` · Next: ${nextCapability.title}` : ''}</p>
            </div>
          </div>
          <Button variant="outline" size="sm" asChild><Link href="/academy/explore"><Compass className="h-4 w-4" /> Explore a side topic</Link></Button>
        </div>
        {children}
      </div>
    );
  }

  if (enrolled && !showLegacyMaterial) {
    return (
      <div className="mx-auto max-w-5xl space-y-6 py-8">
        <section className="overflow-hidden rounded-3xl border bg-[radial-gradient(circle_at_top_right,rgba(14,165,233,0.14),transparent_38%),linear-gradient(145deg,hsl(var(--background)),hsl(var(--muted)/0.28))] p-6 sm:p-9">
          <Badge className="gap-1.5"><BrainCircuit className="h-3.5 w-3.5" /> Your primary learning journey</Badge>
          <h1 className="mt-4 text-3xl font-semibold tracking-tight sm:text-4xl">Continue {state.path.title}</h1>
          <p className="mt-3 max-w-3xl text-sm leading-6 text-muted-foreground">Your durable capability progress belongs to this curated journey. Older Academy material is retained as history, but it does not replace the capability map.</p>
          <div className="mt-5 flex flex-wrap gap-2">
            <Button onClick={() => void startOrResumeReferenceJourney()} disabled={starting}>
              {starting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
              {starting ? 'Opening journey…' : `Continue${nextCapability ? ` · ${nextCapability.title}` : ''}`}
            </Button>
            {activeCourseTitle && <Button variant="outline" onClick={() => setShowLegacyMaterial(true)}>Open older Academy material</Button>}
            <Button variant="ghost" asChild><Link href="/academy/explore"><Compass className="h-4 w-4" /> Explore a topic</Link></Button>
          </div>
        </section>
      </div>
    );
  }

  if (!enrolled) {
    return (
      <div className="mx-auto max-w-5xl space-y-6 py-8">
        <section className="overflow-hidden rounded-3xl border bg-[radial-gradient(circle_at_top_right,rgba(14,165,233,0.16),transparent_36%),linear-gradient(145deg,hsl(var(--background)),hsl(var(--muted)/0.24))] p-6 shadow-sm sm:p-9">
          <Badge className="gap-1.5"><BrainCircuit className="h-3.5 w-3.5" /> Core reference journey</Badge>
          <h1 className="mt-4 text-3xl font-semibold tracking-tight sm:text-5xl">Learn by building a mental model, testing it, and proving it.</h1>
          <p className="mt-4 max-w-3xl text-base leading-7 text-muted-foreground">
            {previouslyEnrolled
              ? `Resume ${state.path.title}. Your previously demonstrated capability evidence is preserved, so OXSIG can continue from what you have actually proven.`
              : `Start with ${state.path.title}. OXSIG begins at zero assumed progress, teaches each capability, asks you to predict outcomes, gives you a real Cyber Lab experiment, then evaluates your explanation against persisted evidence.`}
          </p>
          <div className="mt-5 grid gap-3 sm:grid-cols-3">
            <Card><CardHeader><CardTitle className="text-sm">Understand</CardTitle><CardDescription>Technical explanation and visual models focus on the exact capability.</CardDescription></CardHeader></Card>
            <Card><CardHeader><CardTitle className="text-sm">Experiment</CardTitle><CardDescription>Predict first, run the prepared lab observation, then inspect the real result.</CardDescription></CardHeader></Card>
            <Card><CardHeader><CardTitle className="text-sm">Demonstrate</CardTitle><CardDescription>Explain the result back. Only persisted evidence advances capability progress.</CardDescription></CardHeader></Card>
          </div>
          <div className="mt-6 flex flex-wrap items-center gap-2">
            <Button onClick={() => void startOrResumeReferenceJourney()} disabled={starting}>
              {starting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
              {starting ? 'Starting…' : previouslyEnrolled ? 'Resume learning journey' : 'Start with zero assumed progress'}
            </Button>
            <Button variant="outline" asChild><Link href="/academy/explore"><Compass className="h-4 w-4" /> Explore a side topic</Link></Button>
          </div>
          <p className="mt-4 text-xs text-muted-foreground">
            {previouslyEnrolled
              ? 'Leaving a journey pauses enrollment; it does not erase evidence you already produced.'
              : 'Explore is temporary and does not enroll you, replace your journey, or mark any capability complete.'}
          </p>
        </section>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="mx-auto flex max-w-[1800px] flex-wrap items-center justify-between gap-3 rounded-2xl border bg-muted/20 px-4 py-3">
        <div><p className="text-sm font-semibold">Older Academy material</p><p className="text-xs text-muted-foreground">This material is retained for reference; capability progress remains attached to your curated journey.</p></div>
        <Button size="sm" onClick={() => void startOrResumeReferenceJourney()} disabled={starting}>{starting ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowRight className="h-4 w-4" />} Return to core journey</Button>
      </div>
      {children}
    </div>
  );
}
