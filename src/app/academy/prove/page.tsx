'use client';

import * as React from 'react';
import Link from 'next/link';
import { ArrowLeft, ArrowRight, BrainCircuit, CheckCircle2, Loader2, ShieldCheck, TerminalSquare } from 'lucide-react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { getCsrfToken } from '@/lib/security/csrf-client';

type Capability = {
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
  enrollment: null | { status: string; recommendedCapabilityId: string | null };
  demonstratedCount: number;
  totalCapabilities: number;
  capabilities: Capability[];
};

type AssessmentResult = {
  capabilityId: string;
  result: 'attempted' | 'demonstrated';
  score: number;
  status: 'developing' | 'demonstrated';
  feedback: string;
  evidenceConnection: string;
  misconceptions: string[];
  nextStep: string | null;
};

export default function CuratedCapabilityProvePage() {
  const [state, setState] = React.useState<PathState | null>(null);
  const [loaded, setLoaded] = React.useState(false);
  const [selectedId, setSelectedId] = React.useState<string | null>(null);
  const [explanation, setExplanation] = React.useState('');
  const [busy, setBusy] = React.useState<'load' | 'assess' | null>('load');
  const [result, setResult] = React.useState<AssessmentResult | null>(null);

  const load = React.useCallback(async () => {
    setBusy('load');
    try {
      const response = await fetch('/api/learning/paths', { cache: 'no-store' });
      if (!response.ok) throw new Error('OXSIG could not load your capability evidence');
      const body = await response.json() as { paths?: PathState[] };
      const active = (body.paths || []).find((path) => path.enrollment?.status === 'active') || null;
      setState(active);
      setSelectedId((current) => {
        if (!active) return null;
        if (current && active.capabilities.some((capability) => capability.id === current)) return current;
        return active.enrollment?.recommendedCapabilityId
          || active.capabilities.find((capability) => capability.status !== 'demonstrated')?.id
          || active.capabilities[0]?.id
          || null;
      });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Capability evidence could not be loaded');
    } finally {
      setLoaded(true);
      setBusy(null);
    }
  }, []);

  React.useEffect(() => { void load(); }, [load]);

  async function assess() {
    if (!state || !selectedId || explanation.trim().length < 20) return;
    setBusy('assess');
    setResult(null);
    try {
      const token = await getCsrfToken();
      const response = await fetch(`/api/learning/paths/${encodeURIComponent(state.path.id)}/assessment`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-csrf-token': token },
        body: JSON.stringify({ capabilityId: selectedId, explanation: explanation.trim() }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body?.error || 'OXSIG could not evaluate this capability');
      const assessment = body.assessment as AssessmentResult;
      setResult(assessment);
      if (assessment.result === 'demonstrated') {
        toast.success('Capability demonstrated. Your persisted evidence now advances the journey.');
        await load();
      } else {
        toast.info('This capability is still developing. No progress was skipped.');
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Capability assessment failed');
    } finally {
      setBusy(null);
    }
  }

  if (!loaded && busy === 'load') {
    return <div className="flex min-h-[60vh] items-center justify-center text-sm text-muted-foreground"><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Loading capability evidence…</div>;
  }

  if (!state) {
    return (
      <div className="mx-auto max-w-3xl py-8">
        <Card>
          <CardHeader>
            <CardTitle>Start a learning journey first</CardTitle>
            <CardDescription>Assessment evidence belongs to an active curated capability journey. Starting a journey does not assume any progress.</CardDescription>
          </CardHeader>
          <CardContent><Button asChild><Link href="/academy/paths"><ArrowLeft className="h-4 w-4" /> Choose learning path</Link></Button></CardContent>
        </Card>
      </div>
    );
  }

  const selected = state.capabilities.find((capability) => capability.id === selectedId) || state.capabilities[0];
  const isActiveDirectory = state.path.id === 'active-directory-operations';
  const practiceHref = isActiveDirectory && selected
    ? `/operations?operation=black-domain&capability=${encodeURIComponent(selected.id)}`
    : '/academy';

  return (
    <div className="mx-auto max-w-6xl space-y-6 py-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Button variant="ghost" asChild><Link href="/academy"><ArrowLeft className="h-4 w-4" /> Back to Academy</Link></Button>
        <Badge className="gap-1.5"><ShieldCheck className="h-3.5 w-3.5" /> Evidence-based assessment</Badge>
      </div>

      <section className="overflow-hidden rounded-3xl border bg-[radial-gradient(circle_at_top_right,rgba(16,185,129,0.14),transparent_36%),linear-gradient(145deg,hsl(var(--background)),hsl(var(--muted)/0.24))] p-6 sm:p-8">
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">{state.path.title} · Prove what you know</p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight sm:text-4xl">Skip teaching only when the evidence says you can.</h1>
        <p className="mt-3 max-w-3xl text-sm leading-6 text-muted-foreground">This route is for learners who already understand a capability. OXSIG will not accept a text-only claim: you must first pass the real practical checkpoint, then explain the mechanism and connect it to what the lab actually showed.</p>
        <p className="mt-4 text-sm font-medium">{state.demonstratedCount}/{state.totalCapabilities} capabilities currently demonstrated</p>
      </section>

      <div className="grid gap-5 lg:grid-cols-[320px_minmax(0,1fr)]">
        <aside className="space-y-2">
          {state.capabilities.map((capability) => (
            <button
              key={capability.id}
              type="button"
              onClick={() => { setSelectedId(capability.id); setExplanation(''); setResult(null); }}
              className={`w-full rounded-2xl border p-3 text-left transition ${capability.id === selected?.id ? 'bg-primary/5 ring-1 ring-primary/30' : 'hover:bg-muted/30'}`}
            >
              <div className="flex items-start gap-3">
                <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full border text-xs ${capability.status === 'demonstrated' ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-600' : ''}`}>{capability.status === 'demonstrated' ? <CheckCircle2 className="h-4 w-4" /> : capability.order}</span>
                <div className="min-w-0"><p className="text-sm font-medium">{capability.title}</p><p className="mt-1 text-[11px] text-muted-foreground">{capability.status === 'demonstrated' ? 'Already demonstrated' : capability.evidence.practiceDemonstrated ? 'Practical evidence ready' : 'Practical evidence required'}</p></div>
              </div>
            </button>
          ))}
        </aside>

        {selected && (
          <main className="space-y-4">
            <Card>
              <CardHeader>
                <div className="flex flex-wrap items-start justify-between gap-3"><div><CardTitle>{selected.title}</CardTitle><CardDescription className="mt-2">{selected.outcome}</CardDescription></div><Badge variant={selected.status === 'demonstrated' ? 'default' : 'outline'}>{selected.status === 'demonstrated' ? 'Demonstrated' : 'Assessment available'}</Badge></div>
              </CardHeader>
              <CardContent className="space-y-5">
                <div className="rounded-2xl border bg-muted/20 p-4"><p className="text-xs font-semibold">Evidence requirement</p><p className="mt-2 text-sm leading-6 text-muted-foreground">{selected.evidenceRequirement}</p></div>

                {!selected.evidence.practiceDemonstrated ? (
                  <div className="rounded-2xl border border-dashed p-5">
                    <p className="font-semibold">First prove it in the lab</p>
                    <p className="mt-2 text-sm leading-6 text-muted-foreground">There is no passed practical evidence for this capability yet. Complete the real checkpoint first; OXSIG will not substitute a written answer for hands-on evidence.</p>
                    <div className="mt-4 flex flex-wrap gap-2"><Button asChild><Link href={practiceHref}><BrainCircuit className="h-4 w-4" /> Open capability practice</Link></Button><Button variant="outline" asChild><Link href="/labs"><TerminalSquare className="h-4 w-4" /> Open Cyber Lab</Link></Button></div>
                  </div>
                ) : selected.status === 'demonstrated' ? (
                  <div className="rounded-2xl border border-emerald-500/30 bg-emerald-500/5 p-5"><p className="flex items-center gap-2 font-semibold text-emerald-700"><CheckCircle2 className="h-5 w-5" /> This capability is already demonstrated</p><p className="mt-2 text-sm text-muted-foreground">You do not need to repeat the assessment unless you want to review the concept in Academy.</p></div>
                ) : (
                  <div className="space-y-4">
                    <div><p className="text-sm font-semibold">Explain it from your own mental model</p><p className="mt-1 text-xs leading-5 text-muted-foreground">Describe the mechanism, what the practical evidence showed, and why that evidence supports your explanation. Avoid simply repeating command output.</p></div>
                    <Textarea value={explanation} onChange={(event) => setExplanation(event.target.value.slice(0, 5000))} className="min-h-[180px] resize-y" placeholder="Explain the mechanism, the evidence you observed, and what that evidence proves." disabled={busy === 'assess'} />
                    <div className="flex items-center justify-between gap-3"><p className="text-xs text-muted-foreground">Passing threshold: 85%. A failed attempt does not advance progress.</p><Button onClick={() => void assess()} disabled={busy === 'assess' || explanation.trim().length < 20}>{busy === 'assess' ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />}{busy === 'assess' ? 'Evaluating…' : 'Evaluate my capability'}</Button></div>
                  </div>
                )}
              </CardContent>
            </Card>

            {result && (
              <Card className={result.result === 'demonstrated' ? 'border-emerald-500/30' : 'border-amber-500/30'}>
                <CardHeader><div className="flex items-center justify-between gap-3"><CardTitle className="text-lg">Assessment result</CardTitle><Badge variant={result.result === 'demonstrated' ? 'default' : 'outline'}>{result.score}% · {result.result === 'demonstrated' ? 'Demonstrated' : 'Developing'}</Badge></div></CardHeader>
                <CardContent className="space-y-4"><p className="text-sm leading-6">{result.feedback}</p><div className="rounded-xl border bg-muted/20 p-3"><p className="text-xs font-semibold">Connection to real evidence</p><p className="mt-2 text-sm leading-6 text-muted-foreground">{result.evidenceConnection}</p></div>{result.misconceptions.length > 0 && <div><p className="text-xs font-semibold">Misconceptions to correct</p><div className="mt-2 space-y-2">{result.misconceptions.map((item) => <p key={item} className="rounded-xl border p-3 text-sm text-muted-foreground">{item}</p>)}</div></div>}{result.nextStep && <p className="text-sm text-muted-foreground"><span className="font-medium text-foreground">Next step:</span> {result.nextStep}</p>}{result.result === 'demonstrated' && <Button asChild><Link href="/academy/paths">Return to capability map <ArrowRight className="h-4 w-4" /></Link></Button>}</CardContent>
              </Card>
            )}
          </main>
        )}
      </div>
    </div>
  );
}
