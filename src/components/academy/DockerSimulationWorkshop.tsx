'use client';

import * as React from 'react';
import Link from 'next/link';
import { ArrowLeft, ArrowRight, Check, CheckCircle2, Circle, GripVertical, HelpCircle, Layers3, Loader2, LockKeyhole, Network, RotateCcw, Server, ShieldCheck, Trophy } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { getCsrfToken } from '@/lib/security/csrf-client';
import {
  DOCKER_SIMULATION_STAGES,
  SIMULATION_SP_PER_STAGE,
  stageIsUnlocked,
  type DockerSimulationStageId,
} from '@/lib/academy/simulation-policy';

type CheckResult = { key: string; label: string; passed: boolean };
type Progress = { stageId: DockerSimulationStageId; verifiedAt: string | null; attempts: number; spAwarded: number; checks: CheckResult[] };
type State = {
  skillId: 'docker';
  progress: Progress[];
  practiceSp: number;
  unlocked: DockerSimulationStageId[];
  evidenceType: 'browser-simulation';
};
type VerifyResult = { passed: boolean; checks: CheckResult[]; state: State };
const stageMap = Object.fromEntries(DOCKER_SIMULATION_STAGES.map(stage => [stage.id, stage])) as Record<DockerSimulationStageId, typeof DOCKER_SIMULATION_STAGES[number]>;

async function errorFromResponse(response: Response): Promise<string> {
  const body = await response.json().catch(() => ({}));
  return String(body.error || 'This simulation is temporarily unavailable');
}

/** A browser-only visual puzzle. No Docker commands, EC2, or remote labs run here. */
export default function DockerSimulationWorkshop() {
  const [state, setState] = React.useState<State | null>(null);
  const [active, setActive] = React.useState<DockerSimulationStageId>('container');
  const [selections, setSelections] = React.useState<Record<string, string>>({});
  const [checks, setChecks] = React.useState<CheckResult[] | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState('');
  const [showWhy, setShowWhy] = React.useState(false);

  const stage = stageMap[active];
  const done = new Set(state?.progress.filter(item => item.verifiedAt).map(item => item.stageId) || []);
  const finished = done.has(active);
  const current = state?.progress.find(item => item.stageId === active);

  React.useEffect(() => {
    let cancelled = false;
    fetch('/api/academy/simulator', { cache: 'no-store' })
      .then(async response => {
        if (!response.ok) throw new Error(await errorFromResponse(response));
        return response.json() as Promise<State>;
      })
      .then(next => { if (!cancelled) setState(next); })
      .catch(e => { if (!cancelled) setError(e instanceof Error ? e.message : 'Cannot load simulator'); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  function selectStage(id: DockerSimulationStageId) {
    if (!stageIsUnlocked(id, done)) return;
    setActive(id);
    setSelections({});
    setChecks(null);
    setShowWhy(false);
  }

  function place(slotId: string, value: string) {
    const slot = stage.slots.find(item => item.id === slotId);
    if (!slot || !slot.options.some(option => option.value === value) || busy) return;
    setSelections(current => ({ ...current, [slotId]: value }));
    setChecks(null);
  }

  function acceptDrop(event: React.DragEvent<HTMLButtonElement>, slotId: string) {
    event.preventDefault();
    try {
      const payload = JSON.parse(event.dataTransfer.getData('application/x-oxsig-academy')) as { slot: string; value: string };
      if (payload.slot === slotId) place(slotId, payload.value);
    } catch {
      // Invalid or cross-origin drag payload: no state change.
    }
  }

  async function verify() {
    if (busy) return;
    setBusy(true);
    try {
      const token = await getCsrfToken();
      const response = await fetch('/api/academy/simulator', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-csrf-token': token },
        body: JSON.stringify({ stageId: active, selections }),
      });
      if (!response.ok) throw new Error(await errorFromResponse(response));
      const result = (await response.json()) as VerifyResult;
      setChecks(result.checks);
      setState(result.state);
      if (result.passed) toast.success('Checkpoint verified! The next station is now unlocked.');
      else toast.info('Some checks did not pass. Inspect the marked connections and try again.');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not check configuration');
    } finally {
      setBusy(false);
    }
  }

  const completed = state?.progress.filter(item => item.verifiedAt).length || 0;
  const nextStage = DOCKER_SIMULATION_STAGES[stage.chapter];
  if (loading) return <div className="flex items-center gap-3 p-8 text-sm"><Loader2 className="h-5 w-5 animate-spin" /> Loading your Docker workshop…</div>;
  if (error || !state) return <Card className="m-4"><CardHeader><CardTitle>Docker workshop unavailable</CardTitle><CardDescription>{error || 'Unable to load your practice progress.'}</CardDescription></CardHeader><CardContent><Button asChild variant="outline"><Link href="/academy">Back to Academy</Link></Button></CardContent></Card>;

  return (
    <main className="mx-auto max-w-6xl space-y-5 pb-12">
      <header className="rounded-2xl border bg-gradient-to-br from-blue-500/10 via-background to-emerald-500/10 p-5 sm:p-8">
        <Link href="/academy" className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:underline"><ArrowLeft className="h-3 w-3" /> All learning worlds</Link>
        <div className="mt-4 flex flex-wrap items-start justify-between gap-4">
          <div className="space-y-2">
            <Badge variant="outline">DevOps → Docker · Interactive workshop</Badge>
            <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">Docker Kingdom</h1>
            <p className="max-w-xl text-sm leading-6 text-muted-foreground">Build a container, wire its network and protect its data. Drag components into the workbench, or tap to select them on mobile. Every passing checkpoint lights up the road ahead.</p>
          </div>
          <div className="rounded-xl border bg-background/90 px-5 py-3 text-center">
            <div className="flex items-center justify-center gap-2 text-2xl font-bold"><Trophy className="h-5 w-5 text-amber-500" /> {state.practiceSp} SP</div>
            <p className="text-xs text-muted-foreground">{completed}/3 practice stations</p>
          </div>
        </div>
        <div className="mt-5 h-2 overflow-hidden rounded-full bg-muted" role="progressbar" aria-label="Docker workshop progress" aria-valuemin={0} aria-valuemax={3} aria-valuenow={completed}>
          <div className="h-full rounded-full bg-emerald-500 transition-all" style={{ width: `${(completed / 3) * 100}%` }} />
        </div>
        <p className="mt-2 text-xs text-muted-foreground">Simulation SP measures browser practice only. It does not award live lab verification, mentor credentials, learning credits, or earnings.</p>
      </header>

      <section aria-label="Docker kingdom roadmap" className="grid gap-2 sm:grid-cols-3">
        {DOCKER_SIMULATION_STAGES.map((item, index) => {
          const complete = done.has(item.id);
          const available = stageIsUnlocked(item.id, done);
          const selected = item.id === active;
          return (
            <div key={item.id} className="relative min-w-0">
              <button type="button" aria-current={selected ? 'step' : undefined} disabled={!available} onClick={() => selectStage(item.id)}
                className={`w-full rounded-xl border p-4 text-left transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary ${complete ? 'border-emerald-500/70 bg-emerald-500/10' : selected ? 'border-primary bg-primary/10' : 'bg-card'} ${!available ? 'cursor-not-allowed opacity-55' : 'hover:border-primary'}`}>
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-muted-foreground">CASTLE {item.chapter}</span>
                  {complete ? <CheckCircle2 className="h-5 w-5 text-emerald-500" /> : available ? <Circle className="h-5 w-5" /> : <LockKeyhole className="h-5 w-5 text-muted-foreground" />}
                </div>
                <div className="mt-3 font-semibold">{item.title}</div>
                <p className="mt-1 text-xs text-muted-foreground">{complete ? 'Verified · green checkpoint' : available ? selected ? 'Currently exploring' : 'Unlocked' : 'Locked until previous castle passes'}</p>
              </button>
              {index < DOCKER_SIMULATION_STAGES.length - 1 && <div className={`my-1 flex h-2 items-center justify-center text-xs sm:absolute sm:-right-3 sm:top-1/2 sm:z-10 sm:my-0 ${complete ? 'text-emerald-500' : 'text-muted-foreground'}`} aria-hidden="true"><ArrowRight className="h-4 w-4 rotate-90 sm:rotate-0" /></div>}
            </div>
          );
        })}
      </section>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_280px]">
        <section className="order-1 space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-xl"><Server className="h-5 w-5" /> {stage.title}</CardTitle>
              <CardDescription>{stage.instruction}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-5">
              <div className="rounded-xl border bg-muted/20 p-3 sm:p-5">
                <div className="mb-4 flex items-center justify-between gap-2 text-xs font-medium">
                  <span className="flex items-center gap-2"><Layers3 className="h-4 w-4" /> Interactive configuration</span>
                  <Badge variant={finished ? 'default' : 'outline'}>{finished ? 'Verified' : 'Practice environment'}</Badge>
                </div>
                <div aria-label="Simulated Docker connection" className="grid grid-cols-[minmax(0,1fr)_50px_minmax(0,1fr)] items-center gap-2">
                  <div className="min-w-0 rounded-xl border bg-background p-3 text-center">
                    <Server className="mx-auto mb-2 h-6 w-6 text-primary" />
                    <p className="break-words text-xs font-semibold">{stage.from}</p>
                  </div>
                  <div className="flex flex-col items-center justify-center gap-2" aria-hidden="true">
                    <Network className={finished ? 'h-5 w-5 text-emerald-500' : 'h-5 w-5 text-muted-foreground'} />
                    <div className={`h-1 w-full rounded-full ${finished ? 'bg-emerald-500' : 'bg-border'}`} />
                    {finished && <Check className="h-4 w-4 text-emerald-500" />}
                  </div>
                  <div className="min-w-0 rounded-xl border bg-background p-3 text-center">
                    <Layers3 className="mx-auto mb-2 h-6 w-6 text-primary" />
                    <p className="break-words text-xs font-semibold">{stage.to}</p>
                  </div>
                </div>
                <div className="mt-5 grid gap-4 md:grid-cols-2">
                  {stage.slots.map(slot => {
                    const value = selections[slot.id];
                    const outcome = checks?.find(item => item.key === slot.id);
                    return (
                      <div key={slot.id} className="space-y-2">
                        <p className="text-xs font-semibold">{slot.label}</p>
                        <button type="button" onDragOver={event => event.preventDefault()} onDrop={event => acceptDrop(event, slot.id)}
                          aria-label={`Drop zone for ${slot.label}`}
                          className={`flex min-h-16 w-full items-center justify-center rounded-xl border-2 border-dashed p-3 text-center text-xs transition ${outcome ? outcome.passed ? 'border-emerald-500 bg-emerald-500/10' : 'border-red-500 bg-red-500/5' : value ? 'border-primary bg-primary/10' : 'border-muted-foreground/30'}`}>
                          {value ? <span className="break-all font-mono">{slot.options.find(opt => opt.value === value)?.label || value}</span> : <span className="text-muted-foreground">Drop a component here or choose below</span>}
                        </button>
                        <label htmlFor={`slot-${slot.id}`} className="sr-only">Choose {slot.label}</label>
                        <select id={`slot-${slot.id}`} value={value || ''} onChange={e => place(slot.id, e.target.value)} className="w-full rounded-md border bg-background p-2 text-xs">
                          <option value="">Choose {slot.label}</option>
                          {slot.options.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
                        </select>
                        {outcome && <p className={`flex items-center gap-1 text-xs ${outcome.passed ? 'text-emerald-600' : 'text-red-600'}`}>{outcome.passed ? <CheckCircle2 className="h-3.5 w-3.5" /> : <HelpCircle className="h-3.5 w-3.5" />}{outcome.passed ? 'Connection verified' : 'Needs another configuration'}</p>}
                      </div>
                    );
                  })}
                </div>
              </div>
              <div>
                <p className="mb-2 text-xs font-semibold">Drag a component to its matching slot (or use the selector)</p>
                <div className="flex flex-wrap gap-2">
                  {stage.slots.flatMap(slot => slot.options.map(option => (
                    <button key={`${slot.id}:${option.value}`} draggable onDragStart={event => event.dataTransfer.setData('application/x-oxsig-academy', JSON.stringify({ slot: slot.id, value: option.value }))}
                      type="button" onClick={() => place(slot.id, option.value)} title={slot.hint}
                      className="inline-flex max-w-full items-center gap-2 rounded-lg border bg-background px-3 py-2 text-xs transition hover:bg-muted focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary">
                      <GripVertical className="h-3 w-3 shrink-0 text-muted-foreground" />
                      <span className="break-all text-left">{option.label}</span>
                    </button>
                  )))}
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-3 border-t pt-4">
                <Button disabled={busy || stage.slots.some(slot => !selections[slot.id])} onClick={() => void verify()}>
                  {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <ShieldCheck className="mr-2 h-4 w-4" />}
                  Check configuration
                </Button>
                <Button variant="outline" disabled={busy} onClick={() => { setSelections({}); setChecks(null); }}><RotateCcw className="mr-2 h-4 w-4" /> Reset workbench</Button>
                {finished && nextStage && <Button variant="secondary" onClick={() => selectStage(nextStage.id)}>Next castle <ArrowRight className="ml-2 h-4 w-4" /></Button>}
              </div>
              <div aria-live="polite" className="text-sm">
                {checks && (checks.every(c => c.passed) ? <p className="flex items-center gap-2 text-emerald-600"><CheckCircle2 className="h-4 w-4" /> Correct configuration. This station is complete.</p> : <p className="text-muted-foreground">Some parts need attention. Adjust the marked slots, then test again.</p>)}
                {finished && !checks && <p className="text-emerald-600">This castle was previously completed. You can revisit and experiment without losing your SP.</p>}
              </div>
            </CardContent>
          </Card>
        </section>
        <aside className="order-2 space-y-3">
          <Card>
            <CardHeader><CardTitle className="text-base">Your mission</CardTitle><CardDescription>Configure first. Ask for help only when needed.</CardDescription></CardHeader>
            <CardContent className="space-y-3 text-sm">
              <p>{stage.instruction}</p>
              <Button variant="outline" size="sm" className="w-full" onClick={() => setShowWhy(v => !v)}><HelpCircle className="mr-2 h-4 w-4" /> {showWhy ? 'Hide explanation' : 'How does this work?'}</Button>
              {showWhy && <p className="rounded-lg bg-muted/50 p-3 leading-6 text-muted-foreground">{stage.explanation}</p>}
              <p className="text-xs text-muted-foreground">Checks used: {current?.attempts || 0}. A failed attempt does not erase a previous success.</p>
              <p className="text-xs text-muted-foreground">Each first verified practice castle awards {SIMULATION_SP_PER_STAGE} SP. No payment or credential entitlement is granted.</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader><CardTitle className="text-base">Ready for real engineering?</CardTitle><CardDescription>Practice instantly here, then verify actual Docker behavior in your authorized Linux lab.</CardDescription></CardHeader>
            <CardContent className="space-y-2">
              <Button variant="outline" asChild className="w-full"><Link href="/academy/missions">Open real Docker missions <ArrowRight className="ml-2 h-4 w-4" /></Link></Button>
              <p className="text-xs text-muted-foreground">Real lab assessments, Skills Passport evidence and mentor eligibility are separate from simulation checkpoints.</p>
            </CardContent>
          </Card>
        </aside>
      </div>
    </main>
  );
}
