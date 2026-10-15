'use client';

import * as React from 'react';
import Link from 'next/link';
import { ArrowRight, BookOpen, CheckCircle2, Circle, ClipboardCheck, LockKeyhole, Loader2, MessageCircle, NotebookPen, ShieldCheck, Terminal, Trophy, Wrench } from 'lucide-react';
import { toast } from 'sonner';
import InteractiveSsmTerminal from '@/components/labs/InteractiveSsmTerminal';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { DOCKER_MISSIONS, MISSION_IDS, type DockerMissionId, type MissionDifficulty } from '@/lib/academy/docker-missions';
import { getLabsSnapshot } from '@/lib/labs/client';
import { getCsrfToken } from '@/lib/security/csrf-client';

type Check = { key: string; label: string; passed: boolean };
type Progress = {
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
type Panel = 'terminal' | 'mentor' | 'notes' | 'verify';

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
  const [selected, setSelected] = React.useState(0);
  const [difficulty, setDifficulty] = React.useState<MissionDifficulty>('intermediate');
  const [panel, setPanel] = React.useState<Panel>('terminal');
  const [notes, setNotes] = React.useState('');
  const [question, setQuestion] = React.useState('');
  const [messages, setMessages] = React.useState<MentorEntry[]>([]);
  const [lastChecks, setLastChecks] = React.useState<Check[] | null>(null);
  const [busy, setBusy] = React.useState<string | null>('loading');
  const [error, setError] = React.useState<string | null>(null);

  const mission = DOCKER_MISSIONS[selected];
  const record = progress.find(item => item.missionId === mission.id);
  const unlocked = selected === 0 || Boolean(progress.find(item => item.missionId === MISSION_IDS[selected - 1])?.verifiedAt);
  const completedCount = progress.filter(item => item.verifiedAt).length;
  const lab = labs.find(item => item.id === labId);

  const refresh = React.useCallback(async () => {
    const [stateResponse, snapshot] = await Promise.all([
      fetch('/api/academy/missions', { cache: 'no-store' }),
      getLabsSnapshot(),
    ]);
    if (!stateResponse.ok) throw new Error(await responseError(stateResponse));
    const data = await stateResponse.json() as { progress: Progress[] };
    setProgress(data.progress || []);
    if (snapshot.ok) {
      const running = ((snapshot.data.instances || []) as Lab[]).filter(item => item.status === 'running');
      setLabs(running);
      setLabId(current => running.some(item => item.id === current) ? current : (running[0]?.id || ''));
    }
  }, []);

  React.useEffect(() => {
    void refresh().catch(e => setError(e instanceof Error ? e.message : 'Cannot load Mission Control')).finally(() => setBusy(null));
  }, [refresh]);

  function selectMission(index: number) {
    if (index > 0 && !progress.find(item => item.missionId === MISSION_IDS[index - 1])?.verifiedAt) return;
    const existing = progress.find(item => item.missionId === MISSION_IDS[index]);
    setSelected(index);
    setNotes(existing?.notes || '');
    setDifficulty(existing?.difficulty || 'intermediate');
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
          ? HINTS[mission.id][Math.min(n + 1, 2)]
          : HINTS[mission.id][n];
      setMessages(old => [...old, { who: 'mentor', text }]);
      setPanel('mentor');
    } catch (e) { toast.error(e instanceof Error ? e.message : 'Hint unavailable'); }
    finally { setBusy(null); }
  }

  async function askMentor() {
    const asked = question.trim();
    if (!asked) return;
    setQuestion('');
    setMessages(old => [...old, { who: 'learner', text: asked }]);
    setBusy('mentor');
    try {
      const result = await action({ action: 'mentor', missionId: mission.id, question: asked, difficulty });
      setMessages(old => [...old, { who: 'mentor', text: result.answer.answer + (result.answer.suggestedAction ? '\nNext: ' + result.answer.suggestedAction : '') }]);
    } catch (e) { toast.error(e instanceof Error ? e.message : 'AI mentor unavailable'); }
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
    } catch (e) { toast.error(e instanceof Error ? e.message : 'Could not prepare incident'); }
    finally { setBusy(null); }
  }

  async function verify() {
    if (!labId) return toast.error('Select a running Linux lab first.');
    setBusy('verify');
    try {
      const result = await action({ action: 'verify', missionId: mission.id, labInstanceId: labId, difficulty });
      setProgress(old => [...old.filter(p => p.missionId !== mission.id), result.progress]);
      setLastChecks(result.checks);
      toast[result.passed ? 'success' : 'info'](result.passed ? 'Mission verified from the real lab. Next mission unlocked!' : 'Some checks failed. Inspect the evidence and try again.');
    } catch (e) { toast.error(e instanceof Error ? e.message : 'Verification unavailable'); }
    finally { setBusy(null); }
  }

  if (busy === 'loading') return <div className="flex items-center gap-2 p-8 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Loading real Academy mission records…</div>;
  if (error) return <Card><CardHeader><CardTitle>Mission Control is unavailable</CardTitle><CardDescription>{error}</CardDescription></CardHeader><CardContent><Button variant="outline" onClick={() => { setBusy('loading'); setError(null); void refresh().catch(e => setError(String(e))).finally(() => setBusy(null)); }}>Retry</Button></CardContent></Card>;

  return (
    <div className="mx-auto max-w-[1600px] space-y-4 pb-8">
      <header className="rounded-2xl border bg-gradient-to-r from-primary/10 via-background to-background p-5">
        <div className="flex flex-wrap justify-between gap-4">
          <div className="space-y-2">
            <Badge variant="secondary"><Trophy className="mr-1 h-3 w-3" /> Mission-based learning</Badge>
            <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">Academy Mission Control</h1>
            <p className="max-w-2xl text-sm text-muted-foreground">Diagnose, build, test, and earn verified progress in your real disposable Cyber Lab.</p>
          </div>
          <div className="rounded-xl border bg-background/80 p-3 text-right">
            <div className="text-2xl font-bold">{completedCount * 100} XP</div>
            <div className="text-xs text-muted-foreground">{completedCount}/3 missions verified</div>
          </div>
        </div>
      </header>

      <section className="grid gap-3 md:grid-cols-3" aria-label="Docker mission progression">
        {DOCKER_MISSIONS.map((item, index) => {
          const done = Boolean(progress.find(p => p.missionId === item.id)?.verifiedAt);
          const available = index === 0 || Boolean(progress.find(p => p.missionId === MISSION_IDS[index - 1])?.verifiedAt);
          return <button key={item.id} type="button" disabled={!available} onClick={() => selectMission(index)}
            className={'rounded-xl border p-4 text-left transition ' + (selected === index ? 'border-primary bg-primary/5' : 'bg-card hover:bg-muted/50') + (!available ? ' cursor-not-allowed opacity-60' : '')}>
            <div className="mb-2 flex items-center justify-between">
              <Badge variant="outline">Mission {item.number}</Badge>
              {done ? <CheckCircle2 className="h-4 w-4 text-primary" /> : available ? <Circle className="h-4 w-4 text-muted-foreground" /> : <LockKeyhole className="h-4 w-4 text-muted-foreground" />}
            </div>
            <div className="font-semibold">{item.title}</div>
            <div className="mt-1 text-xs text-muted-foreground">{item.category} · {done ? 'Verified' : available ? 'Available' : 'Locked'}</div>
          </button>;
        })}
      </section>

      <div className="grid items-start gap-4 xl:grid-cols-[290px_minmax(0,1fr)]">
        <aside className="space-y-4">
          <Card>
            <CardHeader><CardTitle className="text-base">Mission {mission.number}: {mission.title}</CardTitle><CardDescription>{mission.ticket}</CardDescription></CardHeader>
            <CardContent className="space-y-4">
              <p className="text-sm font-medium">{mission.objective}</p>
              <div className="space-y-1">
                <label htmlFor="mission-difficulty" className="text-xs font-semibold">Coaching difficulty</label>
                <select id="mission-difficulty" value={difficulty} onChange={e => setDifficulty(e.target.value as MissionDifficulty)} className="w-full rounded-md border bg-background p-2 text-sm">
                  <option value="beginner">Beginner — direct support</option>
                  <option value="intermediate">Intermediate — guided diagnosis</option>
                  <option value="advanced">Advanced — limited hints</option>
                </select>
                <p className="text-[11px] text-muted-foreground">Difficulty changes mentoring, not the verification standard.</p>
              </div>
              <div className="space-y-1">
                <label htmlFor="mission-lab" className="text-xs font-semibold">Connected lab</label>
                <select id="mission-lab" value={labId} onChange={e => setLabId(e.target.value)} className="w-full rounded-md border bg-background p-2 text-sm">
                  {!labs.length && <option value="">No running labs</option>}
                  {labs.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}
                </select>
                {!labs.length && <p className="text-xs text-amber-600">A running managed Linux lab is required. Docker must also be installed inside the machine.</p>}
                <Button asChild variant="outline" size="sm" className="mt-2 w-full"><Link href="/labs">Open Cyber Labs <ArrowRight className="h-3.5 w-3.5" /></Link></Button>
              </div>
              {mission.id === 'repair' && !record?.verifiedAt && <Button variant="secondary" className="w-full" onClick={() => void prepareFault()} disabled={!labId || busy !== null}><Wrench className="h-4 w-4" />{busy === 'prepare' ? 'Seeding incident…' : record?.preparedAt && record.labInstanceId === labId ? 'Reset incident fault' : 'Seed broken deployment'}</Button>}
              {record?.verifiedAt && <p className="flex items-center gap-2 text-xs text-primary"><ShieldCheck className="h-4 w-4" /> Passed with server-executed evidence</p>}
            </CardContent>
          </Card>
          <Card>
            <CardHeader><CardTitle className="text-sm">Objectives & evidence</CardTitle></CardHeader>
            <CardContent className="space-y-2">
              {(lastChecks || record?.checks || []).length
                ? (lastChecks || record?.checks || []).map(check => <div key={check.key} className="flex gap-2 text-xs"><span>{check.passed ? <CheckCircle2 className="h-4 w-4 text-primary" /> : <Circle className="h-4 w-4 text-amber-500" />}</span>{check.label}</div>)
                : <p className="text-xs text-muted-foreground">Run verification to obtain observed checks from the lab.</p>}
              <p className="border-t pt-2 text-[11px] text-muted-foreground">Scores are never awarded for typing a command or asking AI. Only a verified live result counts.</p>
            </CardContent>
          </Card>
        </aside>

        <main className="min-w-0 space-y-4">
          <div role="tablist" aria-label="Mission tools" className="grid grid-cols-4 gap-2">
            {([['terminal','Terminal',Terminal],['mentor','AI mentor',MessageCircle],['notes','Notes',NotebookPen],['verify','Tests',ClipboardCheck]] as const).map(([id,label,Icon]) => <Button key={id} role="tab" aria-selected={panel===id} size="sm" variant={panel===id ? 'default' : 'outline'} onClick={() => setPanel(id)}><Icon className="h-4 w-4" /><span className="hidden sm:inline">{label}</span></Button>)}
          </div>
          <div className={panel === 'terminal' ? '' : 'hidden'}>
            <Card>
              <CardHeader><CardTitle className="text-base">Live lab terminal</CardTitle><CardDescription>Commands here execute in your own connected Linux lab, not inside ChatGPT. Use Docker only in an isolated disposable machine.</CardDescription></CardHeader>
              <CardContent className="space-y-3">
                {lab ? <InteractiveSsmTerminal key={lab.id} labInstanceId={lab.id} machineLabel={lab.name} /> : <div className="rounded-xl border p-5 text-sm text-muted-foreground">Launch a Linux lab from Cyber Labs and select it here to access your live terminal.</div>}
                <div className="space-y-2">
                  <div className="text-xs font-medium">Suggested investigation commands</div>
                  {mission.commands.map((cmd,i) => <div key={i} className="break-all rounded-md bg-muted p-2 font-mono text-xs">{cmd}</div>)}
                  <p className="text-[11px] text-muted-foreground">Suggested commands are examples, not auto-executed. Choose when and what to run.</p>
                </div>
              </CardContent>
            </Card>
          </div>
          {panel === 'mentor' && <Card>
            <CardHeader><CardTitle className="text-base">Mission AI mentor</CardTitle><CardDescription>Ask questions about the scenario. AI can guide, but cannot mark a mission as completed.</CardDescription></CardHeader>
            <CardContent className="space-y-3">
              <div className="max-h-72 space-y-3 overflow-y-auto rounded-lg bg-muted/40 p-3" aria-live="polite">
                {messages.length === 0 && <p className="text-xs text-muted-foreground">Try: “My container runs but the website doesn't open. What should I check?”</p>}
                {messages.map((msg,i) => <div key={i} className="text-sm"><span className="mb-1 block text-xs font-semibold">{msg.who === 'mentor' ? 'OXSIG Mentor' : 'You'}</span><p className="whitespace-pre-wrap">{msg.text}</p></div>)}
              </div>
              <Textarea value={question} maxLength={1500} onChange={e => setQuestion(e.target.value)} placeholder="Describe what you observed, or ask why something failed…"/>
              <div className="flex flex-wrap gap-2">
                <Button disabled={!question.trim() || busy !== null} onClick={() => void askMentor()}>{busy === 'mentor' ? <Loader2 className="h-4 w-4 animate-spin" /> : <MessageCircle className="h-4 w-4" />} Ask mentor</Button>
                <Button variant="outline" onClick={() => void showHint()} disabled={busy !== null}><BookOpen className="h-4 w-4" /> Reveal progressive hint</Button>
              </div>
              <p className="text-[11px] text-muted-foreground">Hints requested: {record?.hintsUsed || 0}. AI guidance depends on server configuration and should be checked against actual command output.</p>
            </CardContent>
          </Card>}
          {panel === 'notes' && <Card>
            <CardHeader><CardTitle className="text-base">Engineering notebook</CardTitle><CardDescription>Record observations, root cause, fixes, and evidence. Notes are persisted to your account.</CardDescription></CardHeader>
            <CardContent className="space-y-3">
              <Textarea rows={10} maxLength={4000} value={notes} onChange={e => setNotes(e.target.value)} placeholder={'Observation:\nRoot cause:\nFix:\nVerification:\nWhat I learned:'}/>
              <Button onClick={() => void saveNotes()} disabled={busy !== null}>{busy === 'notes' ? <Loader2 className="h-4 w-4 animate-spin" /> : <NotebookPen className="h-4 w-4" />} Save engineering notes</Button>
            </CardContent>
          </Card>}
          {panel === 'verify' && <Card>
            <CardHeader><CardTitle className="text-base">Server-verified acceptance tests</CardTitle><CardDescription>OXSIG executes fixed read-only checks through AWS Systems Manager. Progress cannot be awarded from browser-only claims.</CardDescription></CardHeader>
            <CardContent className="space-y-3">
              {mission.id === 'repair' && !record?.preparedAt && <p className="rounded-lg border border-amber-500/30 p-3 text-sm">Seed the broken deployment first, then repair it using your terminal.</p>}
              <p className="text-sm text-muted-foreground">We check container state, published ports and a real HTTP response{mission.id === 'persist' ? ', plus the named volume and its stored content.' : '.'}</p>
              <Button disabled={!labId || !unlocked || busy !== null || (mission.id === 'repair' && (!record?.preparedAt || record.labInstanceId !== labId))} onClick={() => void verify()}>{busy === 'verify' ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />} Run live verification</Button>
              {(lastChecks || record?.checks || []).map(check => <div key={check.key} className="flex items-center gap-2 rounded-lg border p-3 text-sm">{check.passed ? <CheckCircle2 className="h-4 w-4 text-primary" /> : <Circle className="h-4 w-4 text-amber-600" />}{check.label}<span className="ml-auto text-xs">{check.passed ? 'PASS' : 'FAIL'}</span></div>)}
              {record?.verifiedAt && <div className="rounded-lg border border-primary/30 p-3 text-sm">Verified: {new Date(record.verifiedAt).toLocaleString()} · 100 XP earned</div>}
              {record?.verifiedAt && selected < DOCKER_MISSIONS.length - 1 && <Button className="w-full" onClick={() => selectMission(selected + 1)}>Unlock next mission <ArrowRight className="h-4 w-4" /></Button>}
            </CardContent>
          </Card>}
        </main>
      </div>
      <p className="text-xs text-muted-foreground">Mission Control v1 · Three Docker challenges. Live validation requires a running AWS-backed Linux lab with Docker installed, online SSM, and migration 060. No public application ports need to be exposed.</p>
    </div>
  );
}
