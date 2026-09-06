'use client';

import * as React from 'react';
import Link from 'next/link';
import {
  ArrowLeft,
  ArrowRight,
  BookOpenCheck,
  Bot,
  Check,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Circle,
  Clock3,
  Loader2,
  MessageCircleQuestion,
  Mic,
  Pause,
  Play,
  RotateCcw,
  ShieldCheck,
  Sparkles,
  Square,
  Terminal,
  Volume2,
  WandSparkles,
} from 'lucide-react';
import { toast } from 'sonner';
import InteractiveSsmTerminal from '@/components/labs/InteractiveSsmTerminal';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import type {
  AcademyCourse,
  AcademyLesson,
  AcademyPracticeEvaluation,
  AcademyQuestionAnswer,
} from '@/lib/academy/types';
import {
  AI_TERMINAL_QUERY_EVENT,
  AI_TERMINAL_RESULT_EVENT,
  AI_TERMINAL_RUN_EVENT,
  AI_TERMINAL_STATE_EVENT,
  type AiTerminalRunRequest,
  type AiTerminalRunResult,
  type AiTerminalState,
} from '@/lib/labs/ai-terminal-events';
import { getLabsSnapshot } from '@/lib/labs/client';
import { notifyLocalStorageChange } from '@/lib/persistence/storage-change-observer';
import { getCsrfToken } from '@/lib/security/csrf-client';
import { useOxsigVoiceInput } from '@/lib/voice/use-voice-input';
import { useOxsigVoicePlayback } from '@/lib/voice/use-voice-playback';

const COURSE_KEY = 'oxsig:academy-course:v1';
const PROGRESS_KEY = 'oxsig:academy-progress:v1';
const MAX_PROMPT = 800;

type LessonQa = { question: string; answer: AcademyQuestionAnswer };
type LabInstance = { id: string; slug: string; name: string; status: string };
type AcademyExecution = {
  command: string;
  stdout: string;
  stderr: string;
  exitCode: number;
  risk: 'read-only' | 'changes-system';
  executionId: string;
  evidenceId: string;
  provenance: 'browser-observed' | 'server-executed' | 'provider-attested' | 'learner-provided';
  executionReceiptId: string;
  terminalSessionId: string;
  surface: 'academy';
};
type PracticeResult = {
  execution: AcademyExecution;
  evaluation?: AcademyPracticeEvaluation;
};

async function apiError(response: Response, fallback: string) {
  const body = await response.json().catch(() => ({}));
  return body?.error || fallback;
}

function uid() {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function executeInVisibleTerminal(labInstanceId: string, command: string) {
  return new Promise<AiTerminalRunResult>((resolve, reject) => {
    const requestId = uid();
    const timeout = window.setTimeout(() => {
      window.removeEventListener(AI_TERMINAL_RESULT_EVENT, onResult);
      reject(new Error('The Academy terminal did not return the checkpoint result in time.'));
    }, 50_000);

    const onResult = (event: Event) => {
      const result = (event as CustomEvent<AiTerminalRunResult>).detail;
      if (!result || result.requestId !== requestId || result.labInstanceId !== labInstanceId) return;
      window.clearTimeout(timeout);
      window.removeEventListener(AI_TERMINAL_RESULT_EVENT, onResult);
      resolve(result);
    };

    window.addEventListener(AI_TERMINAL_RESULT_EVENT, onResult);
    window.dispatchEvent(new CustomEvent<AiTerminalRunRequest>(AI_TERMINAL_RUN_EVENT, {
      detail: { requestId, labInstanceId, command, surface: 'academy' },
    }));
  });
}

function lessonContext(lesson: AcademyLesson) {
  return [
    lesson.summary,
    lesson.explanation,
    `Key points: ${lesson.keyPoints.join(' | ')}`,
    `Visual: ${lesson.visual.nodes.join(' -> ')}`,
    lesson.practice ? `Practice: ${lesson.practice.instruction} Command: ${lesson.practice.command}` : '',
    `Checkpoint: ${lesson.checkpoint}`,
  ].filter(Boolean).join('\n\n');
}

function narrationText(course: AcademyCourse, lesson: AcademyLesson) {
  const parts = [
    `${course.title}. ${lesson.title}.`,
    lesson.summary,
    lesson.explanation,
    `Key points. ${lesson.keyPoints.join('. ')}.`,
    `Visual model. ${lesson.visual.nodes.join(', then ')}.`,
  ];
  if (lesson.practice) parts.push(`Practice. ${lesson.practice.instruction}. Expected result. ${lesson.practice.expected}.`);
  parts.push(`Checkpoint. ${lesson.checkpoint}`);
  return parts.join(' ');
}

function progressPercent(course: AcademyCourse, completed: Set<string>) {
  if (!course.lessons.length) return 0;
  return Math.round((completed.size / course.lessons.length) * 100);
}

export default function AcademyPage() {
  const [prompt, setPrompt] = React.useState('Teach me Docker basics');
  const [course, setCourse] = React.useState<AcademyCourse | null>(null);
  const [activeIndex, setActiveIndex] = React.useState(0);
  const [completed, setCompleted] = React.useState<Set<string>>(() => new Set());
  const [busy, setBusy] = React.useState<'generate' | 'ask' | 'practice' | null>(null);
  const [question, setQuestion] = React.useState('');
  const [qa, setQa] = React.useState<Record<string, LessonQa[]>>({});
  const { speakingKey, play: playVoice, stop: stopVoice } = useOxsigVoicePlayback();
  const voiceInput = useOxsigVoiceInput({
    onTranscript: ({ transcript }) => {
      setQuestion((current) => {
        const combined = current.trim() ? `${current.trim()} ${transcript}` : transcript;
        return combined.slice(0, 2000);
      });
    },
    onError: (error) => toast.error(error.message),
  });
  const narrating = speakingKey === 'academy-lesson';
  const voiceInputBusy = voiceInput.recording || voiceInput.processing || voiceInput.state === 'requesting-permission';
  const [hydrated, setHydrated] = React.useState(false);
  const [instructorCollapsed, setInstructorCollapsed] = React.useState(false);
  const [runningLab, setRunningLab] = React.useState<LabInstance | null>(null);
  const [loadingLab, setLoadingLab] = React.useState(true);
  const [terminalConnected, setTerminalConnected] = React.useState(false);
  const [practiceResults, setPracticeResults] = React.useState<Record<string, PracticeResult>>({});

  React.useEffect(() => {
    try {
      const savedCourse = window.localStorage.getItem(COURSE_KEY);
      const savedProgress = window.localStorage.getItem(PROGRESS_KEY);
      if (savedCourse) setCourse(JSON.parse(savedCourse) as AcademyCourse);
      if (savedProgress) {
        const value = JSON.parse(savedProgress) as { activeIndex?: number; completed?: string[] };
        setActiveIndex(Math.max(0, value.activeIndex || 0));
        setCompleted(new Set(value.completed || []));
      }
    } catch {
      window.localStorage.removeItem(COURSE_KEY);
      window.localStorage.removeItem(PROGRESS_KEY);
    } finally {
      setHydrated(true);
    }
  }, []);

  React.useEffect(() => {
    if (!hydrated) return;
    if (course) window.localStorage.setItem(COURSE_KEY, JSON.stringify(course));
    else window.localStorage.removeItem(COURSE_KEY);
    window.localStorage.setItem(PROGRESS_KEY, JSON.stringify({ activeIndex, completed: Array.from(completed) }));
    notifyLocalStorageChange(COURSE_KEY);
  }, [activeIndex, completed, course, hydrated]);

  const loadLab = React.useCallback(async () => {
    try {
      const result = await getLabsSnapshot();
      if (!result.ok) return;
      const current = (result.data.instances || []).find((instance) => instance.status === 'running') as LabInstance | undefined;
      setRunningLab(current || null);
    } finally {
      setLoadingLab(false);
    }
  }, []);

  React.useEffect(() => {
    void loadLab();
    const timer = window.setInterval(() => void loadLab(), 8000);
    return () => window.clearInterval(timer);
  }, [loadLab]);

  React.useEffect(() => {
    const onTerminalState = (event: Event) => {
      const detail = (event as CustomEvent<AiTerminalState>).detail;
      if (!detail || detail.labInstanceId !== runningLab?.id) return;
      setTerminalConnected(detail.connected);
    };

    setTerminalConnected(false);
    window.addEventListener(AI_TERMINAL_STATE_EVENT, onTerminalState);
    window.dispatchEvent(new Event(AI_TERMINAL_QUERY_EVENT));
    return () => window.removeEventListener(AI_TERMINAL_STATE_EVENT, onTerminalState);
  }, [runningLab?.id]);

  const activeLesson = course?.lessons[Math.min(activeIndex, Math.max(0, (course?.lessons.length || 1) - 1))] || null;
  const progress = course ? progressPercent(course, completed) : 0;

  async function generateCourse(value = prompt) {
    const request = value.trim();
    if (request.length < 3) return;
    if (request.length > MAX_PROMPT) {
      toast.error(`Keep the course request under ${MAX_PROMPT} characters.`);
      return;
    }

    voiceInput.cancel();
    setBusy('generate');
    stopVoice();
    try {
      const token = await getCsrfToken();
      const response = await fetch('/api/academy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-csrf-token': token },
        body: JSON.stringify({ action: 'generate', prompt: request }),
      });
      if (!response.ok) throw new Error(await apiError(response, 'Academy could not generate this course'));
      const body = await response.json() as { course: AcademyCourse };
      setCourse(body.course);
      setActiveIndex(0);
      setCompleted(new Set());
      setQa({});
      setQuestion('');
      setPracticeResults({});
      setInstructorCollapsed(false);
      toast.success('Your synchronized AI course is ready.');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Academy course generation failed');
    } finally {
      setBusy(null);
    }
  }

  async function askInstructor() {
    if (!course || !activeLesson || !question.trim()) return;
    const asked = question.trim();
    voiceInput.cancel();
    stopVoice();
    setBusy('ask');
    setQuestion('');
    try {
      const token = await getCsrfToken();
      const response = await fetch('/api/academy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-csrf-token': token },
        body: JSON.stringify({
          action: 'ask',
          question: asked,
          courseTitle: course.title,
          lessonTitle: activeLesson.title,
          lessonContext: lessonContext(activeLesson),
        }),
      });
      if (!response.ok) throw new Error(await apiError(response, 'Academy instructor could not answer'));
      const body = await response.json() as { answer: AcademyQuestionAnswer };
      setQa((current) => ({
        ...current,
        [activeLesson.id]: [...(current[activeLesson.id] || []), { question: asked, answer: body.answer }],
      }));
    } catch (error) {
      setQuestion(asked);
      toast.error(error instanceof Error ? error.message : 'Academy instructor failed');
    } finally {
      setBusy(null);
    }
  }

  async function runPractice() {
    if (!course || !activeLesson?.practice) return;
    if (!runningLab) {
      toast.error('Start a Cyber Lab before running this checkpoint.');
      return;
    }
    if (!terminalConnected) {
      toast.error('Wait for the Academy terminal to connect before running this checkpoint.');
      return;
    }

    voiceInput.cancel();
    stopVoice();
    const practice = activeLesson.practice;
    setBusy('practice');
    try {
      toast.info('Binding the approved checkpoint to the live terminal session and running it visibly…');
      const terminalResult = await executeInVisibleTerminal(runningLab.id, practice.command);
      if (terminalResult.error) throw new Error(terminalResult.error);
      if (
        terminalResult.surface !== 'academy' ||
        !terminalResult.executionId ||
        !terminalResult.evidenceId ||
        !terminalResult.executionReceiptId ||
        !terminalResult.terminalSessionId ||
        !terminalResult.provenance ||
        (terminalResult.risk !== 'read-only' && terminalResult.risk !== 'changes-system')
      ) {
        throw new Error('The Academy terminal returned incomplete bound execution evidence.');
      }

      const execution: AcademyExecution = {
        command: terminalResult.command,
        stdout: terminalResult.stdout,
        stderr: terminalResult.stderr,
        exitCode: terminalResult.exitCode,
        risk: terminalResult.risk,
        executionId: terminalResult.executionId,
        evidenceId: terminalResult.evidenceId,
        provenance: terminalResult.provenance,
        executionReceiptId: terminalResult.executionReceiptId,
        terminalSessionId: terminalResult.terminalSessionId,
        surface: 'academy',
      };
      setPracticeResults((current) => ({ ...current, [activeLesson.id]: { execution } }));

      const evaluationToken = await getCsrfToken();
      const evaluationResponse = await fetch('/api/academy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-csrf-token': evaluationToken },
        body: JSON.stringify({
          action: 'evaluate',
          evidenceId: execution.evidenceId,
          labInstanceId: runningLab.id,
          courseTitle: course.title,
          lessonTitle: activeLesson.title,
          instruction: practice.instruction,
          command: execution.command,
          expected: practice.expected,
          stdout: execution.stdout,
          stderr: execution.stderr,
          exitCode: execution.exitCode,
        }),
      });
      if (!evaluationResponse.ok) throw new Error(await apiError(evaluationResponse, 'The checkpoint ran, but the Academy instructor could not evaluate it'));
      const evaluationBody = await evaluationResponse.json() as { evaluation: AcademyPracticeEvaluation };
      setPracticeResults((current) => ({
        ...current,
        [activeLesson.id]: { execution, evaluation: evaluationBody.evaluation },
      }));
      setInstructorCollapsed(false);
      if (evaluationBody.evaluation.status === 'passed') toast.success('Checkpoint verified from exact bound terminal evidence.');
      else toast.info('The instructor found something to review in the exact terminal evidence.');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Academy checkpoint execution failed');
    } finally {
      setBusy(null);
    }
  }

  function toggleNarration() {
    if (!course || !activeLesson) return;

    if (narrating) {
      stopVoice();
      return;
    }

    voiceInput.cancel();
    void playVoice(narrationText(course, activeLesson), 'academy-lesson').catch((error) => {
      if (error instanceof DOMException && error.name === 'AbortError') return;
      toast.error(error instanceof Error ? error.message : 'ElevenLabs narration failed');
    });
  }

  function toggleVoiceInput() {
    if (voiceInput.recording) {
      voiceInput.stop();
      return;
    }
    stopVoice();
    void voiceInput.start();
  }

  function selectLesson(index: number) {
    voiceInput.cancel();
    stopVoice();
    setActiveIndex(index);
    setQuestion('');
  }

  function markLessonComplete() {
    if (!course || !activeLesson) return;
    setCompleted((current) => {
      const next = new Set(current);
      next.add(activeLesson.id);
      return next;
    });
    if (activeIndex < course.lessons.length - 1) selectLesson(activeIndex + 1);
  }

  function resetCourse() {
    voiceInput.cancel();
    stopVoice();
    setCourse(null);
    setActiveIndex(0);
    setCompleted(new Set());
    setQa({});
    setPracticeResults({});
    setInstructorCollapsed(false);
    window.localStorage.removeItem(COURSE_KEY);
    window.localStorage.removeItem(PROGRESS_KEY);
  }

  if (!hydrated) {
    return <div className="flex min-h-[60vh] items-center justify-center text-sm text-muted-foreground"><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Opening Academy…</div>;
  }

  if (!course || !activeLesson) {
    return (
      <div className="mx-auto max-w-5xl space-y-8 py-6">
        <section className="relative overflow-hidden rounded-3xl border bg-gradient-to-br from-primary/10 via-background to-purple-500/10 p-6 shadow-sm sm:p-10">
          <div className="absolute -right-20 -top-20 h-64 w-64 rounded-full bg-primary/10 blur-3xl" />
          <div className="relative max-w-3xl space-y-5">
            <Badge className="gap-1.5"><WandSparkles className="h-3.5 w-3.5" /> AI-native Academy</Badge>
            <div className="space-y-3">
              <h1 className="text-4xl font-semibold tracking-tight sm:text-5xl">What do you want to learn?</h1>
              <p className="max-w-2xl text-base leading-7 text-muted-foreground sm:text-lg">Ask for a topic. Oxsig builds the roadmap, teaches it by voice and visuals, and synchronizes practical lessons with a real Cyber Lab terminal.</p>
            </div>
            <div className="rounded-2xl border bg-background/80 p-3 shadow-sm backdrop-blur">
              <Textarea
                value={prompt}
                onChange={(event) => setPrompt(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' && !event.shiftKey) {
                    event.preventDefault();
                    if (!busy) void generateCourse();
                  }
                }}
                maxLength={MAX_PROMPT}
                className="min-h-[96px] resize-none border-0 bg-transparent text-base shadow-none focus-visible:ring-0"
                placeholder="Teach me Docker basics"
                disabled={busy === 'generate'}
              />
              <div className="flex flex-wrap items-center justify-between gap-3 border-t pt-3">
                <p className="text-xs text-muted-foreground">Roadmap → instructor → visual model → real terminal → evidence → feedback.</p>
                <Button onClick={() => void generateCourse()} disabled={busy === 'generate' || prompt.trim().length < 3}>
                  {busy === 'generate' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                  Build my course
                </Button>
              </div>
            </div>
          </div>
        </section>

        <section className="grid gap-4 md:grid-cols-3">
          {[
            ['Docker from zero', 'Containers, images, networking, volumes and a practical first deployment.'],
            ['Linux networking for cybersecurity', 'Interfaces, routes, sockets, DNS, packet flow and lab inspection.'],
            ['Teach me systemd', 'Units, dependencies, boot flow, service management and troubleshooting.'],
          ].map(([title, description]) => (
            <button key={title} type="button" className="text-left" onClick={() => { setPrompt(`Teach me ${title}`); void generateCourse(`Teach me ${title}`); }} disabled={busy === 'generate'}>
              <Card className="h-full transition hover:-translate-y-0.5 hover:bg-muted/30 hover:shadow-md">
                <CardHeader><CardTitle className="text-base">{title}</CardTitle><CardDescription>{description}</CardDescription></CardHeader>
              </Card>
            </button>
          ))}
        </section>
      </div>
    );
  }

  const currentQa = qa[activeLesson.id] || [];
  const currentPracticeResult = practiceResults[activeLesson.id];

  return (
    <div className="mx-auto max-w-[1800px] space-y-4 py-1">
      <section className="overflow-hidden rounded-2xl border bg-gradient-to-r from-primary/10 via-background to-purple-500/10 p-4">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0 flex-1 space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="secondary">{course.level}</Badge>
              <Badge variant="outline" className="gap-1"><Clock3 className="h-3 w-3" /> ~{course.estimatedMinutes} min</Badge>
              <Badge variant="outline">{course.lessons.length} lessons</Badge>
              <Badge variant={runningLab ? 'default' : 'outline'} className="gap-1">
                <Terminal className="h-3 w-3" />
                {loadingLab ? 'Checking lab' : runningLab ? `${runningLab.name} running` : 'No running lab'}
              </Badge>
            </div>
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div>
                <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">{course.title}</h1>
                <p className="mt-1 max-w-4xl text-sm leading-6 text-muted-foreground">{course.overview}</p>
              </div>
              <Button variant="outline" size="sm" onClick={resetCourse}><RotateCcw className="h-4 w-4" /> New course</Button>
            </div>
          </div>
        </div>
        <div className="mt-4 space-y-2">
          <div className="flex items-center justify-between text-xs"><span className="font-medium">Course progress</span><span className="text-muted-foreground">{progress}% · {completed.size}/{course.lessons.length} lessons</span></div>
          <div className="h-2 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full bg-primary transition-[width] duration-500" style={{ width: `${progress}%` }} /></div>
        </div>
      </section>

      <div className={`grid gap-4 ${instructorCollapsed ? 'lg:grid-cols-[260px_minmax(0,1fr)_68px]' : 'lg:grid-cols-[260px_minmax(0,1fr)_360px]'}`}>
        <aside className="space-y-4 lg:sticky lg:top-20 lg:self-start">
          <Card>
            <CardHeader className="pb-3"><CardTitle className="text-base">Roadmap</CardTitle><CardDescription>Everything on screen follows this lesson marker.</CardDescription></CardHeader>
            <CardContent className="space-y-1">
              {course.lessons.map((lesson, index) => {
                const done = completed.has(lesson.id);
                const active = index === activeIndex;
                const verified = practiceResults[lesson.id]?.evaluation?.status === 'passed';
                return (
                  <button
                    key={lesson.id}
                    type="button"
                    onClick={() => selectLesson(index)}
                    className={`flex w-full items-start gap-3 rounded-xl px-3 py-3 text-left transition ${active ? 'bg-primary/10 text-foreground' : 'hover:bg-muted/50'}`}
                  >
                    <span className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border text-[10px] ${done ? 'border-primary bg-primary text-primary-foreground' : active ? 'border-primary text-primary' : 'text-muted-foreground'}`}>
                      {done ? <Check className="h-3.5 w-3.5" /> : index + 1}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-xs font-semibold">{lesson.title}</span>
                      <span className="mt-1 line-clamp-2 block text-[10px] leading-4 text-muted-foreground">{lesson.summary}</span>
                      {verified && <span className="mt-1 inline-flex items-center gap-1 text-[9px] font-medium text-primary"><ShieldCheck className="h-3 w-3" /> Lab verified</span>}
                    </span>
                  </button>
                );
              })}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3"><CardTitle className="text-sm">Learning objectives</CardTitle></CardHeader>
            <CardContent className="space-y-2">
              {course.objectives.map((objective) => <div key={objective} className="flex gap-2 text-xs leading-5 text-muted-foreground"><CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" />{objective}</div>)}
            </CardContent>
          </Card>
        </aside>

        <main className="min-w-0 space-y-4">
          <Card className="overflow-hidden">
            <CardHeader className="border-b bg-muted/20 pb-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="mb-2 flex flex-wrap items-center gap-2">
                    <Badge variant="secondary">Lesson {activeIndex + 1} of {course.lessons.length}</Badge>
                    {activeLesson.practice && <Badge variant="outline" className="gap-1"><Terminal className="h-3 w-3" /> Hands-on</Badge>}
                    {terminalConnected && runningLab && <Badge className="gap-1"><Circle className="h-2 w-2 fill-current" /> Terminal live</Badge>}
                  </div>
                  <CardTitle className="text-xl sm:text-2xl">Live workspace — {activeLesson.title}</CardTitle>
                  <CardDescription className="mt-2">The roadmap, instructor, visual model, terminal and evidence are synchronized to this lesson.</CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-5 p-4 sm:p-5">
              <section className="rounded-2xl border bg-gradient-to-br from-muted/40 to-background p-4">
                <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2 text-sm font-semibold"><Sparkles className="h-4 w-4 text-primary" /> Visual sync</div>
                  <span className="text-[10px] text-muted-foreground">{activeLesson.visual.title}</span>
                </div>
                <div className="flex flex-col items-stretch justify-center gap-2 md:flex-row md:items-center">
                  {activeLesson.visual.nodes.map((node, index) => (
                    <React.Fragment key={`${node}-${index}`}>
                      <div className="flex min-h-14 flex-1 items-center justify-center rounded-xl border bg-background px-3 py-3 text-center text-xs font-medium shadow-sm">{node}</div>
                      {index < activeLesson.visual.nodes.length - 1 && <ChevronRight className="mx-auto h-4 w-4 shrink-0 rotate-90 text-muted-foreground md:rotate-0" />}
                    </React.Fragment>
                  ))}
                </div>
              </section>

              {activeLesson.practice ? (
                <section className="space-y-4">
                  <div className="rounded-2xl border border-primary/20 bg-primary/5 p-4">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="space-y-1">
                        <div className="flex items-center gap-2 text-sm font-semibold"><Terminal className="h-4 w-4 text-primary" /> {activeLesson.practice.title}</div>
                        <p className="max-w-3xl text-sm leading-6 text-muted-foreground">{activeLesson.practice.instruction}</p>
                      </div>
                      {activeLesson.practice.labRequired && <Badge variant="outline">Cyber Lab checkpoint</Badge>}
                    </div>
                    <pre className="oxsig-scrollbar mt-3 overflow-x-auto rounded-xl bg-black p-4 text-xs text-white"><code>{activeLesson.practice.command}</code></pre>
                    <p className="mt-3 text-xs text-muted-foreground"><span className="font-medium text-foreground">Expected:</span> {activeLesson.practice.expected}</p>
                  </div>

                  {runningLab ? (
                    <div className="rounded-2xl border p-3 sm:p-4">
                      <InteractiveSsmTerminal key={runningLab.id} labInstanceId={runningLab.id} machineLabel={runningLab.name} />
                      <div className="mt-3 flex flex-wrap items-center justify-between gap-3 border-t pt-3">
                        <p className="max-w-2xl text-[11px] leading-5 text-muted-foreground">
                          The checkpoint command above is never run silently. Clicking the button explicitly authorizes it, binds a one-time receipt to this exact active SSM session, runs it visibly, persists browser-observed output, and evaluates only that exact evidence record.
                        </p>
                        <Button onClick={() => void runPractice()} disabled={busy === 'practice' || !terminalConnected}>
                          {busy === 'practice' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
                          {busy === 'practice' ? 'Running & evaluating…' : terminalConnected ? 'Approve & run checkpoint' : 'Waiting for terminal'}
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex min-h-[280px] flex-col items-center justify-center rounded-2xl border border-dashed bg-muted/10 p-6 text-center">
                      {loadingLab ? <Loader2 className="mb-3 h-7 w-7 animate-spin text-primary" /> : <Terminal className="mb-3 h-8 w-8 text-primary" />}
                      <p className="font-semibold">{loadingLab ? 'Checking your Cyber Lab…' : 'Start a lab for this practical step'}</p>
                      <p className="mt-2 max-w-lg text-sm leading-6 text-muted-foreground">When a Linux lab is running, its real persistent terminal appears here in the center of the Academy. You stay in the lesson while you practice.</p>
                      {!loadingLab && <Button asChild className="mt-4"><Link href="/labs"><Play className="h-4 w-4" /> Open Cyber Lab</Link></Button>}
                    </div>
                  )}

                  {currentPracticeResult?.evaluation && (
                    <div className={`rounded-2xl border p-4 ${currentPracticeResult.evaluation.status === 'passed' ? 'border-primary/30 bg-primary/5' : 'border-amber-500/30 bg-amber-500/5'}`}>
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="flex items-center gap-2 font-semibold">
                          {currentPracticeResult.evaluation.status === 'passed' ? <ShieldCheck className="h-5 w-5 text-primary" /> : <Bot className="h-5 w-5 text-amber-600" />}
                          Exact evidence review
                        </div>
                        <Badge variant={currentPracticeResult.evaluation.status === 'passed' ? 'default' : 'outline'}>{currentPracticeResult.evaluation.status === 'passed' ? 'Verified' : 'Needs attention'}</Badge>
                      </div>
                      <p className="mt-3 text-sm font-medium">{currentPracticeResult.evaluation.summary}</p>
                      <p className="mt-2 text-sm leading-6 text-muted-foreground">{currentPracticeResult.evaluation.feedback}</p>
                      <p className="mt-2 font-mono text-[10px] text-muted-foreground">browser-observed · evidence {currentPracticeResult.execution.evidenceId.slice(0, 8)}… · SSM {currentPracticeResult.execution.terminalSessionId.slice(0, 18)}…</p>
                      {currentPracticeResult.evaluation.nextStep && <p className="mt-3 border-t pt-3 text-xs text-muted-foreground"><span className="font-medium text-foreground">Next step:</span> {currentPracticeResult.evaluation.nextStep}</p>}
                    </div>
                  )}
                </section>
              ) : (
                <section className="flex min-h-[320px] flex-col items-center justify-center rounded-2xl border bg-muted/10 p-6 text-center">
                  <BookOpenCheck className="mb-3 h-8 w-8 text-primary" />
                  <p className="font-semibold">Concept lesson — no terminal action required</p>
                  <p className="mt-2 max-w-xl text-sm leading-6 text-muted-foreground">Listen to the instructor, follow the synchronized visual model, ask questions, then complete the checkpoint when the mental model is clear.</p>
                </section>
              )}

              <section className="rounded-2xl border bg-muted/20 p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.15em] text-muted-foreground">Lesson checkpoint</p>
                <p className="mt-2 text-sm leading-6">{activeLesson.checkpoint}</p>
              </section>

              <div className="flex flex-wrap items-center justify-between gap-3 border-t pt-4">
                <Button variant="outline" disabled={activeIndex === 0} onClick={() => selectLesson(activeIndex - 1)}><ArrowLeft className="h-4 w-4" /> Previous</Button>
                {completed.has(activeLesson.id) ? (
                  <Button variant="secondary" disabled><CheckCircle2 className="h-4 w-4" /> Completed</Button>
                ) : (
                  <Button onClick={markLessonComplete}><CheckCircle2 className="h-4 w-4" /> Mark complete {activeIndex < course.lessons.length - 1 && <ArrowRight className="h-4 w-4" />}</Button>
                )}
              </div>
            </CardContent>
          </Card>
        </main>

        {instructorCollapsed ? (
          <aside className="lg:sticky lg:top-20 lg:self-start">
            <Card className="overflow-hidden">
              <CardContent className="flex flex-row items-center justify-between gap-2 p-2 lg:flex-col lg:py-3">
                <Button size="icon" variant="ghost" onClick={() => setInstructorCollapsed(false)} title="Expand instructor" aria-label="Expand instructor"><ChevronLeft className="h-4 w-4" /></Button>
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-blue-500 to-purple-600 text-white"><Bot className="h-4 w-4" /></div>
                <Button size="icon" variant={narrating ? 'secondary' : 'ghost'} onClick={toggleNarration} title={narrating ? 'Stop narration' : 'Play lesson'} aria-label={narrating ? 'Stop narration' : 'Play lesson'}>
                  {narrating ? <Pause className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
                </Button>
                {narrating && <span className="hidden text-[9px] font-semibold uppercase tracking-wider text-primary lg:block">Live</span>}
              </CardContent>
            </Card>
          </aside>
        ) : (
          <aside className="space-y-4 lg:sticky lg:top-20 lg:self-start">
            <Card className="overflow-hidden">
              <CardHeader className="border-b bg-gradient-to-br from-primary/10 via-background to-purple-500/10 pb-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex min-w-0 items-start gap-3">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-blue-500 to-purple-600 text-white"><Bot className="h-4 w-4" /></div>
                    <div className="min-w-0">
                      <CardTitle className="text-base">AI Instructor</CardTitle>
                      <CardDescription className="mt-1">Synced to lesson {activeIndex + 1}.</CardDescription>
                    </div>
                  </div>
                  <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => { voiceInput.cancel(); setInstructorCollapsed(true); }} title="Collapse instructor" aria-label="Collapse instructor"><ChevronRight className="h-4 w-4" /></Button>
                </div>
                <Button className="mt-3 w-full" variant={narrating ? 'secondary' : 'outline'} size="sm" onClick={toggleNarration}>
                  {narrating ? <Pause className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
                  {narrating ? 'Stop narration' : 'Play lesson'}
                </Button>
              </CardHeader>
              <CardContent className="oxsig-scrollbar max-h-[calc(100vh-250px)] space-y-5 overflow-y-auto p-4">
                <section className="space-y-3">
                  <div>
                    <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-primary">Now teaching</p>
                    <h2 className="mt-1 font-semibold">{activeLesson.title}</h2>
                    <p className="mt-1 text-xs leading-5 text-muted-foreground">{activeLesson.summary}</p>
                  </div>
                  <p className="whitespace-pre-line text-sm leading-7 text-foreground/90">{activeLesson.explanation}</p>
                </section>

                <section className="space-y-2">
                  <p className="text-xs font-semibold">Key points</p>
                  {activeLesson.keyPoints.map((point) => <div key={point} className="flex gap-2 rounded-xl border bg-muted/20 p-3 text-xs leading-5"><Circle className="mt-1 h-2.5 w-2.5 shrink-0 fill-primary text-primary" />{point}</div>)}
                </section>

                {currentPracticeResult?.evaluation && (
                  <section className="rounded-xl border bg-muted/20 p-3">
                    <p className="flex items-center gap-2 text-xs font-semibold"><ShieldCheck className="h-4 w-4 text-primary" /> Terminal evidence synced</p>
                    <p className="mt-2 text-xs leading-5 text-muted-foreground">{currentPracticeResult.evaluation.summary}</p>
                  </section>
                )}

                <section className="space-y-3 border-t pt-4">
                  <div className="flex items-center gap-2"><MessageCircleQuestion className="h-4 w-4 text-primary" /><p className="text-sm font-semibold">Interrupt and ask</p></div>
                  {currentQa.length > 0 && (
                    <div className="space-y-3">
                      {currentQa.map((item, index) => (
                        <div key={`${activeLesson.id}-qa-${index}`} className="space-y-2">
                          <div className="ml-5 rounded-xl bg-primary px-3 py-2 text-xs text-primary-foreground">{item.question}</div>
                          <div className="rounded-xl border bg-muted/20 p-3 text-xs leading-5"><p>{item.answer.answer}</p>{item.answer.suggestedAction && <p className="mt-2 border-t pt-2 text-muted-foreground"><span className="font-medium text-foreground">Try next:</span> {item.answer.suggestedAction}</p>}</div>
                        </div>
                      ))}
                    </div>
                  )}
                  <Textarea
                    value={question}
                    onChange={(event) => setQuestion(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter' && !event.shiftKey) {
                        event.preventDefault();
                        if (!busy && !voiceInputBusy) void askInstructor();
                      }
                    }}
                    placeholder={voiceInput.recording ? 'Listening… press stop when you are finished.' : voiceInput.processing ? 'Transcribing your question…' : 'Wait — what exactly is the Docker daemon?'}
                    className="min-h-[84px] resize-none"
                    disabled={busy === 'ask' || voiceInputBusy}
                    maxLength={2000}
                  />
                  <div className="flex gap-2">
                    <Button
                      type="button"
                      size="icon"
                      variant={voiceInput.recording ? 'destructive' : 'outline'}
                      className="shrink-0"
                      disabled={busy === 'ask' || voiceInput.processing || voiceInput.state === 'requesting-permission' || !voiceInput.supported}
                      onClick={toggleVoiceInput}
                      title={voiceInput.recording ? 'Stop recording' : 'Interrupt with your voice'}
                      aria-label={voiceInput.recording ? 'Stop recording' : 'Interrupt with your voice'}
                    >
                      {voiceInput.processing || voiceInput.state === 'requesting-permission'
                        ? <Loader2 className="h-4 w-4 animate-spin" />
                        : voiceInput.recording
                          ? <Square className="h-4 w-4" />
                          : <Mic className="h-4 w-4" />}
                    </Button>
                    <Button className="flex-1" variant="outline" disabled={busy === 'ask' || voiceInputBusy || !question.trim()} onClick={() => void askInstructor()}>
                      {busy === 'ask' ? <Loader2 className="h-4 w-4 animate-spin" /> : <MessageCircleQuestion className="h-4 w-4" />}
                      Ask about this lesson
                    </Button>
                  </div>
                  <p className="text-[10px] leading-4 text-muted-foreground">
                    {voiceInput.recording
                      ? 'Narration is stopped while your microphone is active. Press stop when you finish speaking.'
                      : voiceInput.processing
                        ? 'ElevenLabs is transcribing. Review the question before sending it.'
                        : 'Pressing the mic interrupts narration, records only on your action, and places the transcript here for review before submission.'}
                  </p>
                </section>
              </CardContent>
            </Card>

            {course.prerequisites.length > 0 && (
              <Card><CardHeader className="pb-3"><CardTitle className="text-sm">Prerequisites</CardTitle></CardHeader><CardContent className="space-y-2">{course.prerequisites.map((item) => <div key={item} className="flex gap-2 text-xs text-muted-foreground"><Circle className="mt-1 h-2 w-2 shrink-0 fill-muted-foreground" />{item}</div>)}</CardContent></Card>
            )}
          </aside>
        )}
      </div>
    </div>
  );
}