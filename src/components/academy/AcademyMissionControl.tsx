'use client';

import * as React from 'react';
import Link from 'next/link';
import { ArrowRight, BookOpen, CheckCircle2, Copy, X, Circle, ClipboardCheck, LockKeyhole, Loader2, MessageCircle, NotebookPen, ShieldCheck, Terminal, Wrench } from 'lucide-react';
import { toast } from 'sonner';
import DockerLabAccess from './DockerLabAccess';
import DockerConcept, { type ConceptRecord } from './DockerConcept';
import InteractiveSsmTerminal from '@/components/labs/InteractiveSsmTerminal';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { DOCKER_LEARNING_MODULES } from '@/lib/academy/roadmap-catalog';
import { DOCKER_CHECKS, DOCKER_MISSIONS, MISSION_IDS, type DockerMissionId, type MissionDifficulty } from '@/lib/academy/docker-missions';
import { getCsrfToken } from '@/lib/security/csrf-client';

type Check = { key: string; label: string; passed: boolean };
type Progress = ConceptRecord & {
  missionId: DockerMissionId;
  labInstanceId: string | null;
  notes: string;
  difficulty: MissionDifficulty;
  hintsUsed: number;
  preparedAt: string | null;
  verifiedAt: string | null;
  checks: Check[];
};
type Lab = { id: string; name: string; status: string; slug: string };
type MentorEntry = { who: 'learner' | 'mentor'; text: string };
type Panel = 'terminal' | 'notes' | 'verify';

const HINTS: Record<DockerMissionId, string[]> = {
  deploy: [
    'Begin with docker info. Is Docker installed and is the daemon responding?',
    'Inspect docker ps -a and look for a container called oxsig-academy-web.',
    'Publish port 18080 on the host to port 80 inside the Nginx container.',
  ],
  repair: [
    'Compare the port in the incident ticket with the host port shown by docker ps.',
    'A running container can expose the wrong host port. Run docker port oxsig-academy-web.',
    'Recreate only oxsig-academy-web with host port 18080 mapped to port 80.',
  ],
  persist: [
    'Volumes are independent from their container. Start by inspecting docker volume ls.',
    'Mount oxsig_academy_data at /usr/share/nginx/html when creating the container.',
    'A fresh volume hides the bundled index page. Write the requested line into index.html inside the mounted volume.',
  ],
};

async function responseError(res: Response) {
  const json = await res.json().catch(() => ({}));
  return String(json.error || 'Mission request failed');
}

export default function AcademyMissionControl() {
  const [progress, setProgress] = React.useState<Progress[]>([]);
  const [labs, setLabs] = React.useState<Lab[]>([]);
  const [labId, setLabId] = React.useState('');
  const [dockerReady, setDockerReady] = React.useState(false);
  const [selected, setSelected] = React.useState(0);
  const [difficulty, setDifficulty] = React.useState<MissionDifficulty>('beginner');
  const [panel, setPanel] = React.useState<Panel>('terminal');
  const [sidebarOpen, setSidebarOpen] = React.useState(true);
  const [mentorOpen, setMentorOpen] = React.useState(false);
  const [notes, setNotes] = React.useState('');
  const [question, setQuestion] = React.useState('');
  const [messages, setMessages] = React.useState<MentorEntry[]>([]);
  const [lastChecks, setLastChecks] = React.useState<Check[] | null>(null);
  const [busy, setBusy] = React.useState<string | null>('loading');
  const [error, setError] = React.useState<string | null>(null);
  const [actionError, setActionError] = React.useState('');

  const mission = DOCKER_MISSIONS[selected];
  const record = progress.find(item => item.missionId === mission.id);
  const unlocked = selected === 0 || Boolean(progress.find(item => item.missionId === MISSION_IDS[selected - 1])?.verifiedAt);
  const completedCount = progress.filter(item => item.verifiedAt).length;
  const lab = labs.find(item => item.id === labId);
  // Show expected acceptance criteria even before the learner requests verification.
  // Only the server-observed checks can turn a requirement green.
  const observedChecks = lastChecks || (record?.checks?.length ? record.checks : []);
  const taskChecks = DOCKER_CHECKS[mission.id].map(expected => ({
    ...expected,
    passed: Boolean(observedChecks.find(check => check.key === expected.key)?.passed),
  }));
  const verifiedTaskCount = taskChecks.filter(check => check.passed).length;

  const refresh = React.useCallback(async () => {
    const stateResponse = await fetch('/api/academy/missions', { cache: 'no-store' });
    if (!stateResponse.ok) throw new Error(await responseError(stateResponse));
    const data = await stateResponse.json() as { progress: Progress[] };
    setProgress(data.progress || []);
  }, []);

  React.useEffect(() => {
    void refresh().catch(e => setError(e instanceof Error ? e.message : 'Cannot load Mission Control')).finally(() => setBusy(null));
  }, [refresh]);

  const resumed = React.useRef(false);
  React.useEffect(() => {
    if (busy === 'loading' || resumed.current) return;
    resumed.current = true;
    const first = MISSION_IDS.findIndex(id => !progress.find(p => p.missionId === id)?.verifiedAt);
    const index = first < 0 ? 2 : first;
    setSelected(index);
    setNotes(progress.find(p => p.missionId === MISSION_IDS[index])?.notes || '');
  }, [busy, progress]);

  function selectMission(index: number) {
    if (index > 0 && !progress.find(item => item.missionId === MISSION_IDS[index - 1])?.verifiedAt) return;
    const existing = progress.find(item => item.missionId === MISSION_IDS[index]);
    setSelected(index);
    setNotes(existing?.notes || '');
    setDifficulty(existing?.difficulty || 'beginner');
    setLastChecks(null);
    setMessages([]);
    setPanel('terminal');
  }

  async function action(body: Record<string, unknown>) {
    const token = await getCsrfToken();
    const response = await fetch('/api/academy/missions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-csrf-token': token },
      body: JSON.stringify(body),
    });
    if (!response.ok) throw new Error(await responseError(response));
    return response.json();
  }

  async function copyCommand(command: string) {
    try {
      await navigator.clipboard.writeText(command);
      toast.success('Command copied. Paste it into your terminal when you are ready.');
    } catch {
      toast.error('Copy is unavailable in this browser. Select the command text to copy it.');
    }
  }

  async function saveNotes() {
    setBusy('notes');
    try {
      const result = await action({ action: 'notes', missionId: mission.id, notes });
      setProgress(old => [...old.filter(p => p.missionId !== mission.id), result.progress]);
      toast.success('Engineering notes saved to your Academy account.');
    } catch (e) { toast.error(e instanceof Error ? e.message : 'Could not save notes'); }
    finally { setBusy(null); }
  }

  async function showHint() {
    setBusy('hint');
    try {
      const result = await action({ action: 'hint', missionId: mission.id });
      setProgress(old => [...old.filter(p => p.missionId !== mission.id), result.progress]);
      const n = Math.min(result.progress.hintsUsed - 1, 2);
      const text = difficulty === 'advanced'
        ? HINTS[mission.id][0]
        : difficulty === 'beginner'
          ? HINTS[mission.id][n]
          : HINTS[mission.id][n];
      setMessages(old => [...old, { who: 'mentor', text }]);
      setMentorOpen(true);
    } catch (e) { toast.error(e instanceof Error ? e.message : 'Hint unavailable'); }
    finally { setBusy(null); }
  }

  async function askMentor(explain = false) {
    const asked = explain ? 'Please give me a direct explanation of the current mission concept and a worked example. Clearly distinguish your example from my actual lab evidence.' : question.trim();
    if (!asked) return;
    setQuestion('');
    setMessages(old => [...old, { who: 'learner', text: asked }]);
    setBusy('mentor');
    try {
      const result = await action({ action: 'mentor', missionId: mission.id, question: asked, difficulty });
      await refresh();
      setMessages(old => [...old, { who: 'mentor', text: result.answer.answer + (result.answer.suggestedAction ? '\nNext: ' + result.answer.suggestedAction : '') }]);
    } catch (e) { setMessages(old => [...old, { who: 'mentor', text: 'The AI mentor is unavailable. You can still use the progressive hints, terminal and live verification. Try asking again later.' }]); toast.error(e instanceof Error ? e.message : 'AI mentor unavailable'); }
    finally { setBusy(null); }
  }

  async function prepareFault() {
    if (!labId) return toast.error('Select a running Linux lab first.');
    if (!window.confirm('This action will remove and replace ONLY the reserved oxsig-academy-web container in your selected lab. It will intentionally publish the wrong port (18081) for troubleshooting. Continue?')) return;
    setBusy('prepare');
    try {
      const result = await action({ action: 'prepare', missionId: 'repair', labInstanceId: labId, confirm: true });
      setProgress(old => [...old.filter(p => p.missionId !== 'repair'), result.progress]);
      setLastChecks(null);
      toast.success('Real incident seeded in the selected learner-owned lab.');
    } catch (e) { setActionError(e instanceof Error ? e.message : 'Could not prepare incident. Refresh your environment and try again.'); }
    finally { setBusy(null); }
  }

  async function verify() {
    if (!labId) return toast.error('Select a running Linux lab first.');
    setActionError('');
    setBusy('verify');
    try {
      const result = await action({ action: 'verify', missionId: mission.id, labInstanceId: labId, difficulty });
      setProgress(old => [...old.filter(p => p.missionId !== mission.id), result.progress]);
      setLastChecks(result.checks);
      setPanel('verify');
      toast[result.passed ? 'success' : 'info'](result.passed ? 'Mission verified from the real lab. Next mission unlocked!' : 'Some checks failed. Inspect the evidence and try again.');
    } catch (e) { setActionError(e instanceof Error ? e.message : 'Verification unavailable. Refresh your environment and try again.'); setPanel('verify'); }
    finally { setBusy(null); }
  }

  if (busy === 'loading') return <div className="flex items-center gap-2 p-8 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Loading real Academy mission records…</div>;
  if (error) return <Card><CardHeader><CardTitle>Mission Control is unavailable</CardTitle><CardDescription>{error}</CardDescription></CardHeader><CardContent><Button variant="outline" onClick={() => { setBusy('loading'); setError(null); void refresh().catch(e => setError(String(e))).finally(() => setBusy(null)); }}>Retry</Button></CardContent></Card>;

  return (
    <div className="mx-auto max-w-[1700px] min-w-0 space-y-3 pb-8">
      <header className="flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-card/70 p-3 sm:px-4">
        <div className="min-w-0 space-y-1">
          <div className="flex flex-wrap items-center gap-1 text-xs text-muted-foreground">
            <Link href="/academy/learn/devops" className="hover:text-foreground">DevOps &amp; Cloud</Link>
            <span aria-hidden="true">/</span>
            <span>Docker</span>
          </div>
          <h1 className="text-lg font-bold tracking-tight sm:text-xl">Docker Workspace</h1>
          <p className="text-xs text-muted-foreground">Mission {mission.number}: {mission.title} · {completedCount}/3 missions verified</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant={dockerReady ? 'default' : 'outline'}>{dockerReady ? 'Docker ready' : 'Environment not ready'}</Badge>
          <Button type="button" size="sm" variant="outline" aria-expanded={sidebarOpen} aria-controls="docker-mission-sidebar" onClick={() => setSidebarOpen(value => !value)}>
            <BookOpen className="h-4 w-4" /> {sidebarOpen ? 'Hide mission panel' : 'Show mission panel'}
          </Button>
        </div>
      </header>

      <div className={sidebarOpen ? 'grid min-w-0 items-start gap-3 xl:grid-cols-[minmax(0,1fr)_340px]' : 'grid min-w-0 items-start gap-3'}>
        <main className="min-w-0 space-y-3" aria-label="Docker learning workbench">
          <section aria-label="Linux environment controls">
            <DockerLabAccess onChange={(current, ready) => {
              setLabs(current ? [current] : []);
              setLabId(current?.id || '');
              setDockerReady(ready);
            }} />
          </section>

          {actionError && <p role="alert" className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm">{actionError} Refresh the environment status here before trying again.</p>}

          <Card className="min-w-0 overflow-hidden">
            <CardHeader className="p-3 pb-2 sm:p-4 sm:pb-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <CardTitle className="flex items-center gap-2 text-base"><Terminal className="h-4 w-4" /> Linux terminal</CardTitle>
                  <CardDescription className="mt-1 text-xs">Work directly on your isolated Linux machine. No Cyber Lab navigation required.</CardDescription>
                </div>
                {lab && <Badge variant="outline" className="max-w-full truncate">{lab.name}</Badge>}
              </div>
            </CardHeader>
            <CardContent className="min-w-0 space-y-3 p-2 pt-0 sm:p-4 sm:pt-0">
              {lab
                ? <InteractiveSsmTerminal key={lab.id} labInstanceId={lab.id} machineLabel={lab.name} />
                : <div className="flex min-h-[280px] flex-col items-center justify-center gap-3 rounded-xl border bg-muted/20 p-5 text-center sm:min-h-[420px]">
                    <Terminal className="h-9 w-9 text-muted-foreground" />
                    <p className="text-sm font-medium">Your live terminal will appear here</p>
                    <p className="max-w-md text-xs leading-5 text-muted-foreground">Start Linux using the environment controls above. The terminal connects here when Docker is ready. Your saved mission record stays available.</p>
                  </div>}
            </CardContent>
          </Card>

          <div className="flex flex-wrap items-center gap-2" aria-label="Workspace tools">
            <Button size="sm" variant={mentorOpen ? 'default' : 'outline'} onClick={() => setMentorOpen(value => !value)} aria-pressed={mentorOpen}><MessageCircle className="h-4 w-4" /> AI mentor</Button>
            <Button size="sm" variant={panel === 'notes' ? 'default' : 'outline'} onClick={() => setPanel(panel === 'notes' ? 'terminal' : 'notes')} aria-pressed={panel === 'notes'}><NotebookPen className="h-4 w-4" /> Notes</Button>
            <Button size="sm" variant={panel === 'verify' ? 'default' : 'outline'} onClick={() => setPanel(panel === 'verify' ? 'terminal' : 'verify')} aria-pressed={panel === 'verify'}><ClipboardCheck className="h-4 w-4" /> Results</Button>
            <Button size="sm" disabled={!labId || !dockerReady || !unlocked || busy !== null || (mission.id === 'repair' && (!record?.preparedAt || record.labInstanceId !== labId))} onClick={() => void verify()}>
              {busy === 'verify' ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />} Check progress
            </Button>
          </div>

          {panel === 'notes' && <Card>
            <CardHeader><CardTitle className="text-base">Engineering notes</CardTitle><CardDescription>Save your investigation and reasoning to your account.</CardDescription></CardHeader>
            <CardContent className="space-y-3">
              <Textarea rows={8} maxLength={4000} value={notes} onChange={e => setNotes(e.target.value)} placeholder={'Observation:\nRoot cause:\nFix:\nVerification:\nWhat I learned:'} />
              <Button onClick={() => void saveNotes()} disabled={busy !== null}>{busy === 'notes' ? <Loader2 className="h-4 w-4 animate-spin" /> : <NotebookPen className="h-4 w-4" />} Save notes</Button>
            </CardContent>
          </Card>}

          {panel === 'verify' && <Card>
            <CardHeader><CardTitle className="text-base">Verification results</CardTitle><CardDescription>Only trusted server-executed checks of the real lab can complete a mission.</CardDescription></CardHeader>
            <CardContent className="space-y-3">
              {observedChecks.length === 0 && <p className="text-sm text-muted-foreground">No live verification evidence yet. Start your Linux environment, work through the objective, then choose Check progress.</p>}
              {observedChecks.map(check => <div key={check.key} className="flex items-center gap-2 rounded-lg border p-3 text-sm">{check.passed ? <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" /> : <Circle className="h-4 w-4 shrink-0 text-amber-600" />}{check.label}<span className="ml-auto text-xs">{check.passed ? 'PASS' : 'NOT YET'}</span></div>)}
              {record?.verifiedAt && <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/5 p-3 text-sm">Verified {new Date(record.verifiedAt).toLocaleString()}. This achievement is saved independently of your temporary machine.</div>}
              {record?.verifiedAt && selected < DOCKER_MISSIONS.length - 1 && <Button onClick={() => selectMission(selected + 1)}>Continue to next mission <ArrowRight className="h-4 w-4" /></Button>}
            </CardContent>
          </Card>}
        </main>

        <aside id="docker-mission-sidebar" className={sidebarOpen ? 'min-w-0 space-y-3' : 'hidden'} aria-label="Docker mission guidance">
          <Card>
            <CardHeader className="p-4 pb-2">
              <div className="flex items-center justify-between gap-2">
                <Badge variant="secondary">Mission {mission.number}</Badge>
                <Badge variant={record?.verifiedAt ? 'default' : 'outline'}>{record?.verifiedAt ? 'Verified' : 'In progress'}</Badge>
              </div>
              <CardTitle className="pt-1 text-base">{mission.title}</CardTitle>
              <CardDescription className="text-xs leading-5">{mission.ticket}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3 p-4 pt-1">
              <p className="text-sm font-medium">{mission.objective}</p>
              {mission.id === 'repair' && !record?.verifiedAt && <Button variant="outline" size="sm" className="w-full" onClick={() => void prepareFault()} disabled={!labId || !dockerReady || busy !== null}>
                <Wrench className="h-4 w-4" /> {busy === 'prepare' ? 'Preparing incident…' : record?.preparedAt && record.labInstanceId === labId ? 'Reset incident fault' : 'Seed broken deployment'}
              </Button>}
              <div className="space-y-2 border-t pt-3">
                <div className="flex items-center justify-between gap-2">
                  <h2 className="text-sm font-semibold">Objectives</h2>
                  <span className="text-xs text-muted-foreground">{verifiedTaskCount}/{taskChecks.length} checks passed</span>
                </div>
                <div className="h-1.5 overflow-hidden rounded-full bg-muted" role="progressbar" aria-valuenow={verifiedTaskCount} aria-valuemin={0} aria-valuemax={taskChecks.length} aria-label="Mission checks passed">
                  <div className="h-full bg-emerald-500 transition-all" style={{ width: (verifiedTaskCount / taskChecks.length * 100) + '%' }} />
                </div>
                {taskChecks.map((check,index) => <div key={check.key} className="flex items-start gap-2 rounded-md p-1.5 text-xs">
                  {check.passed ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" /> : <Circle className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />}
                  <span><span className="font-semibold text-muted-foreground">Task {index+1}. </span>{check.label}</span>
                </div>)}
                <Button className="w-full" disabled={!labId || !dockerReady || !unlocked || busy !== null || (mission.id === 'repair' && (!record?.preparedAt || record.labInstanceId !== labId))} onClick={() => void verify()}>
                  {busy === 'verify' ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />} Verify with real lab
                </Button>
                <p className="text-[11px] leading-4 text-muted-foreground">Checks turn green only from server-observed results, not from typing a suggested command.</p>
              </div>
            </CardContent>
          </Card>

          <details className="rounded-xl border bg-card p-3" open>
            <summary className="cursor-pointer text-sm font-semibold">Modules &amp; missions · {completedCount}/3 verified</summary>
            <div className="mt-3 space-y-2" aria-label="Docker learning modules">
              {DOCKER_LEARNING_MODULES.map((module, moduleIndex) => {
                const moduleDone = Boolean(module.missionIds?.length) && module.missionIds!.every(id => Boolean(progress.find(p => p.missionId === id)?.verifiedAt));
                const activeModule = Boolean(module.missionIds?.includes(mission.id));
                return <details key={module.id} className={'rounded-lg border p-2 ' + (activeModule ? 'border-primary/50 bg-primary/5' : 'bg-background')}>
                  <summary className="cursor-pointer text-xs font-semibold">
                    <span className="inline-flex items-center gap-2">
                      {moduleDone ? <CheckCircle2 className="h-4 w-4 text-emerald-600" /> : activeModule ? <Circle className="h-4 w-4 text-rose-500" /> : <LockKeyhole className="h-4 w-4 text-muted-foreground" />}
                      Module {moduleIndex+1}: {module.title}
                    </span>
                  </summary>
                  <p className="mt-2 text-xs leading-5 text-muted-foreground">{module.summary}</p>
                  <div className="mt-2 space-y-2">
                    {(module.missionIds || []).map(missionId => {
                      const index = MISSION_IDS.findIndex(id => id === missionId);
                      const item = DOCKER_MISSIONS[index];
                      if (!item) return null;
                      const done = Boolean(progress.find(p => p.missionId === item.id)?.verifiedAt);
                      const available = index === 0 || Boolean(progress.find(p => p.missionId === MISSION_IDS[index-1])?.verifiedAt);
                      return <button key={missionId} type="button" disabled={!available} onClick={() => selectMission(index)} aria-current={selected === index ? 'step' : undefined}
                        className={'flex w-full items-center gap-2 rounded-md border p-2 text-left text-xs transition ' + (selected === index ? 'border-primary bg-primary/10' : 'hover:bg-muted/50') + (!available ? ' cursor-not-allowed opacity-50' : '')}>
                        {done ? <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" /> : available ? <Circle className="h-4 w-4 shrink-0" /> : <LockKeyhole className="h-4 w-4 shrink-0" />}
                        <span>{item.title}<span className="block text-[11px] text-muted-foreground">{done ? 'Verified' : available ? 'Ready to practice' : 'Complete the previous mission first'}</span></span>
                      </button>;
                    })}
                  </div>
                </details>;
              })}
            </div>
          </details>

          <details className="rounded-xl border bg-card p-3">
            <summary className="cursor-pointer text-sm font-semibold">Learn · Containers and virtual machines</summary>
            <div className="mt-3"><DockerConcept record={progress.find(p => p.missionId === 'deploy')} onSave={refresh} /></div>
          </details>

          <details className="rounded-xl border bg-card p-3">
            <summary className="cursor-pointer text-sm font-semibold">Guidance and suggested commands</summary>
            <div className="mt-3 space-y-3">
              <p className="text-xs text-muted-foreground">Work through the task in your own way. These commands are optional examples, not automatic actions.</p>
              {mission.commands.map((cmd,i) => <div key={i} className="rounded-lg border border-slate-700 bg-slate-950 p-2 text-emerald-300">
                <div className="flex items-start justify-between gap-2">
                  <code className="min-w-0 flex-1 select-text break-all font-mono text-xs leading-5">{cmd}</code>
                  <Button type="button" variant="ghost" size="sm" className="h-7 shrink-0 border border-slate-600 text-slate-200 hover:bg-slate-800 hover:text-white" onClick={() => void copyCommand(cmd)} aria-label={'Copy command: ' + cmd}><Copy className="h-3.5 w-3.5" /> Copy</Button>
                </div>
              </div>)}
              <Button size="sm" variant="outline" onClick={() => void showHint()} disabled={busy !== null}><BookOpen className="h-4 w-4" /> Get a hint</Button>
            </div>
          </details>

          <details className="rounded-xl border bg-card p-3">
            <summary className="cursor-pointer text-sm font-semibold">Coaching level</summary>
            <div className="mt-3 space-y-2">
              <label htmlFor="mission-difficulty" className="text-xs font-medium">How much help would you like?</label>
              <select id="mission-difficulty" value={difficulty} onChange={e => setDifficulty(e.target.value as MissionDifficulty)} className="w-full rounded-md border bg-background p-2 text-sm">
                <option value="beginner">Beginner — direct support</option>
                <option value="intermediate">Intermediate — guided diagnosis</option>
                <option value="advanced">Advanced — limited hints</option>
              </select>
              <p className="text-xs text-muted-foreground">All levels use the same trusted practical verification.</p>
            </div>
          </details>
          <p className="px-2 text-xs leading-5 text-muted-foreground">Your achievements and notes survive lab expiry. A fresh machine requires recreating the practical deployment. <Link href="/academy/learn/docker/simulator" className="underline">Optional visual practice</Link></p>
        </aside>
      </div>
      <div className="fixed bottom-4 right-4 z-40 flex flex-col items-end gap-2 sm:bottom-6 sm:right-6">
        {mentorOpen && <section id="academy-mentor-chat" aria-label="AI mentor chat" className="flex max-h-[min(72vh,580px)] w-[min(92vw,385px)] flex-col overflow-hidden rounded-2xl border bg-card text-card-foreground shadow-2xl">
          <div className="flex items-center justify-between border-b bg-primary/5 px-4 py-3">
            <div className="flex items-center gap-2 text-sm font-semibold"><MessageCircle className="h-4 w-4 text-primary" /> OXSIG AI mentor</div>
            <Button type="button" size="sm" variant="ghost" aria-label="Close AI mentor" onClick={() => setMentorOpen(false)}><X className="h-4 w-4" /></Button>
          </div>
          <p className="px-4 pt-3 text-xs text-muted-foreground">Ask about Mission {mission.number}. The mentor gives guidance but cannot certify lab results or execute commands.</p>
          <div className="mt-2 min-h-[95px] flex-1 space-y-3 overflow-y-auto px-4 py-2" aria-live="polite">
            {messages.length === 0 && <p className="text-sm text-muted-foreground">What is confusing, or what did you observe in the terminal?</p>}
            {messages.map((msg,i) => <div key={i} className="rounded-lg bg-muted/50 p-2 text-sm"><span className="mb-1 block text-xs font-semibold">{msg.who === 'mentor' ? 'OXSIG Mentor' : 'You'}</span><p className="whitespace-pre-wrap">{msg.text}</p></div>)}
          </div>
          <div className="space-y-2 border-t p-3">
            <label className="sr-only" htmlFor="docker-mentor-question">Ask the AI mentor</label>
            <Textarea id="docker-mentor-question" rows={2} value={question} maxLength={1500} onChange={e => setQuestion(e.target.value)} placeholder="Ask about your mission…" />
            <div className="flex flex-wrap gap-2">
              <Button size="sm" disabled={!question.trim() || busy !== null} onClick={() => void askMentor()}>{busy === 'mentor' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <MessageCircle className="h-3.5 w-3.5" />} Send</Button>
              <Button size="sm" variant="outline" disabled={busy !== null} onClick={() => void showHint()}>Get hint</Button>
              <Button size="sm" variant="ghost" disabled={busy !== null} onClick={() => void askMentor(true)}>Explain</Button>
            </div>
            <p className="text-[11px] text-muted-foreground">Assistance used: {record?.hintsUsed || 0}. Practice scores do not decrease for asking for help.</p>
          </div>
        </section>}
        <Button type="button" aria-controls="academy-mentor-chat" aria-expanded={mentorOpen} aria-label={mentorOpen ? 'Hide AI mentor' : 'Open AI mentor'} onClick={() => setMentorOpen(value => !value)} className="h-12 rounded-full px-4 shadow-lg shadow-primary/25">
          <MessageCircle className="h-5 w-5" /> <span className="text-sm">AI help</span>
        </Button>
      </div>
    </div>
  );
}
