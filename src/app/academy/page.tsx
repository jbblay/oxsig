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
  ChevronRight,
  Circle,
  Clock3,
  Loader2,
  MessageCircleQuestion,
  Pause,
  Play,
  RotateCcw,
  Sparkles,
  Terminal,
  Volume2,
  WandSparkles,
} from 'lucide-react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import type { AcademyCourse, AcademyLesson, AcademyQuestionAnswer } from '@/lib/academy/types';

const COURSE_KEY = 'oxsig:academy-course:v1';
const PROGRESS_KEY = 'oxsig:academy-progress:v1';
const MAX_PROMPT = 800;

type LessonQa = { question: string; answer: AcademyQuestionAnswer };

async function csrfToken() {
  const response = await fetch('/api/csrf-token', { cache: 'no-store' });
  if (!response.ok) throw new Error('Secure Academy request setup failed');
  return (await response.json()).token as string;
}

async function apiError(response: Response, fallback: string) {
  const body = await response.json().catch(() => ({}));
  return body?.error || fallback;
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
  const [busy, setBusy] = React.useState<'generate' | 'ask' | null>(null);
  const [question, setQuestion] = React.useState('');
  const [qa, setQa] = React.useState<Record<string, LessonQa[]>>({});
  const [narrating, setNarrating] = React.useState(false);
  const [hydrated, setHydrated] = React.useState(false);

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
  }, [activeIndex, completed, course, hydrated]);

  React.useEffect(() => () => {
    if ('speechSynthesis' in window) window.speechSynthesis.cancel();
  }, []);

  const activeLesson = course?.lessons[Math.min(activeIndex, Math.max(0, (course?.lessons.length || 1) - 1))] || null;
  const progress = course ? progressPercent(course, completed) : 0;

  async function generateCourse(value = prompt) {
    const request = value.trim();
    if (request.length < 3) return;
    if (request.length > MAX_PROMPT) {
      toast.error(`Keep the course request under ${MAX_PROMPT} characters.`);
      return;
    }

    setBusy('generate');
    if ('speechSynthesis' in window) window.speechSynthesis.cancel();
    setNarrating(false);
    try {
      const token = await csrfToken();
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
      toast.success('Your AI course is ready.');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Academy course generation failed');
    } finally {
      setBusy(null);
    }
  }

  async function askInstructor() {
    if (!course || !activeLesson || !question.trim()) return;
    const asked = question.trim();
    setBusy('ask');
    setQuestion('');
    try {
      const token = await csrfToken();
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

  function toggleNarration() {
    if (!course || !activeLesson || !('speechSynthesis' in window)) {
      toast.error('Voice narration is not available in this browser.');
      return;
    }

    if (narrating) {
      window.speechSynthesis.cancel();
      setNarrating(false);
      return;
    }

    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(narrationText(course, activeLesson));
    utterance.rate = 0.96;
    utterance.onend = () => setNarrating(false);
    utterance.onerror = () => setNarrating(false);
    setNarrating(true);
    window.speechSynthesis.speak(utterance);
  }

  function selectLesson(index: number) {
    if ('speechSynthesis' in window) window.speechSynthesis.cancel();
    setNarrating(false);
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
    if ('speechSynthesis' in window) window.speechSynthesis.cancel();
    setNarrating(false);
    setCourse(null);
    setActiveIndex(0);
    setCompleted(new Set());
    setQa({});
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
              <p className="max-w-2xl text-base leading-7 text-muted-foreground sm:text-lg">Ask for a topic. Oxsig builds the roadmap, teaches it visually, narrates each lesson, and creates practical checkpoints that can move into your real Cyber Lab.</p>
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
                <p className="text-xs text-muted-foreground">Try a technology, certification topic, troubleshooting skill, or concept.</p>
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

  return (
    <div className="mx-auto max-w-[1500px] space-y-5 py-2">
      <section className="overflow-hidden rounded-2xl border bg-gradient-to-r from-primary/10 via-background to-purple-500/10 p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="max-w-3xl space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="secondary">{course.level}</Badge>
              <Badge variant="outline" className="gap-1"><Clock3 className="h-3 w-3" /> ~{course.estimatedMinutes} min</Badge>
              <Badge variant="outline">{course.lessons.length} lessons</Badge>
            </div>
            <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">{course.title}</h1>
            <p className="text-sm leading-6 text-muted-foreground">{course.overview}</p>
          </div>
          <Button variant="outline" size="sm" onClick={resetCourse}><RotateCcw className="h-4 w-4" /> New course</Button>
        </div>
        <div className="mt-5 space-y-2">
          <div className="flex items-center justify-between text-xs"><span className="font-medium">Course progress</span><span className="text-muted-foreground">{progress}% · {completed.size}/{course.lessons.length} lessons</span></div>
          <div className="h-2 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full bg-primary transition-[width] duration-500" style={{ width: `${progress}%` }} /></div>
        </div>
      </section>

      <div className="grid gap-5 lg:grid-cols-[290px_minmax(0,1fr)_330px]">
        <aside className="space-y-4 lg:sticky lg:top-20 lg:self-start">
          <Card>
            <CardHeader className="pb-3"><CardTitle className="text-base">Roadmap</CardTitle><CardDescription>AI-generated, Oxsig-structured.</CardDescription></CardHeader>
            <CardContent className="space-y-1">
              {course.lessons.map((lesson, index) => {
                const done = completed.has(lesson.id);
                const active = index === activeIndex;
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
                    <span className="min-w-0"><span className="block text-xs font-semibold">{lesson.title}</span><span className="mt-1 line-clamp-2 block text-[10px] leading-4 text-muted-foreground">{lesson.summary}</span></span>
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

        <main className="min-w-0 space-y-5">
          <Card className="overflow-hidden">
            <CardHeader className="border-b bg-muted/20">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div><p className="mb-1 text-xs font-medium text-primary">Lesson {activeIndex + 1} of {course.lessons.length}</p><CardTitle className="text-2xl">{activeLesson.title}</CardTitle><CardDescription className="mt-2 text-sm">{activeLesson.summary}</CardDescription></div>
                <Button variant={narrating ? 'secondary' : 'outline'} size="sm" onClick={toggleNarration}>
                  {narrating ? <Pause className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
                  {narrating ? 'Stop narration' : 'Play lesson'}
                </Button>
              </div>
            </CardHeader>
            <CardContent className="space-y-7 p-5 sm:p-7">
              <section className="space-y-3">
                <div className="flex items-center gap-2 text-sm font-semibold"><BookOpenCheck className="h-4 w-4 text-primary" /> Understand</div>
                <p className="whitespace-pre-line text-sm leading-7 text-foreground/90">{activeLesson.explanation}</p>
                <div className="grid gap-2 sm:grid-cols-2">
                  {activeLesson.keyPoints.map((point) => <div key={point} className="flex gap-2 rounded-xl border bg-muted/20 p-3 text-xs leading-5"><Circle className="mt-1 h-2.5 w-2.5 shrink-0 fill-primary text-primary" />{point}</div>)}
                </div>
              </section>

              <section className="space-y-3">
                <div className="flex items-center gap-2 text-sm font-semibold"><Sparkles className="h-4 w-4 text-primary" /> Visual model</div>
                <div className="rounded-2xl border bg-gradient-to-br from-muted/40 to-background p-4">
                  <p className="mb-4 text-center text-xs font-medium text-muted-foreground">{activeLesson.visual.title}</p>
                  <div className="flex flex-col items-stretch justify-center gap-2 md:flex-row md:items-center">
                    {activeLesson.visual.nodes.map((node, index) => (
                      <React.Fragment key={`${node}-${index}`}>
                        <div className="flex min-h-16 flex-1 items-center justify-center rounded-xl border bg-background px-3 py-3 text-center text-xs font-medium shadow-sm">{node}</div>
                        {index < activeLesson.visual.nodes.length - 1 && <ChevronRight className="mx-auto h-4 w-4 shrink-0 rotate-90 text-muted-foreground md:rotate-0" />}
                      </React.Fragment>
                    ))}
                  </div>
                </div>
              </section>

              {activeLesson.practice && (
                <section className="space-y-3 rounded-2xl border border-primary/20 bg-primary/5 p-4 sm:p-5">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2 text-sm font-semibold"><Terminal className="h-4 w-4 text-primary" /> Practice checkpoint</div>
                    {activeLesson.practice.labRequired && <Badge variant="outline">Cyber Lab</Badge>}
                  </div>
                  <div><p className="font-medium">{activeLesson.practice.title}</p><p className="mt-1 text-sm leading-6 text-muted-foreground">{activeLesson.practice.instruction}</p></div>
                  <pre className="oxsig-scrollbar overflow-x-auto rounded-xl bg-black p-4 text-xs text-white"><code>{activeLesson.practice.command}</code></pre>
                  <p className="text-xs text-muted-foreground"><span className="font-medium text-foreground">Expected:</span> {activeLesson.practice.expected}</p>
                  <div className="flex flex-wrap gap-2">
                    <Button asChild><Link href="/labs"><Play className="h-4 w-4" /> Open Cyber Lab</Link></Button>
                    <p className="flex items-center text-[11px] text-muted-foreground">Run it in the real terminal. AI Practitioner can inspect and explain the actual result.</p>
                  </div>
                </section>
              )}

              <section className="rounded-2xl border bg-muted/20 p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.15em] text-muted-foreground">Checkpoint</p>
                <p className="mt-2 text-sm leading-6">{activeLesson.checkpoint}</p>
              </section>

              <div className="flex flex-wrap items-center justify-between gap-3 border-t pt-5">
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

        <aside className="space-y-4 lg:sticky lg:top-20 lg:self-start">
          <Card>
            <CardHeader><div className="flex items-center gap-2"><div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-blue-500 to-purple-600 text-white"><Bot className="h-4 w-4" /></div><div><CardTitle className="text-base">Ask your instructor</CardTitle><CardDescription>Questions stay inside this lesson.</CardDescription></div></div></CardHeader>
            <CardContent className="space-y-3">
              {currentQa.length > 0 && (
                <div className="oxsig-scrollbar max-h-[360px] space-y-3 overflow-y-auto pr-1">
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
                    if (!busy) void askInstructor();
                  }
                }}
                placeholder="Why does Docker need an image?"
                className="min-h-[90px] resize-none"
                disabled={busy === 'ask'}
                maxLength={2000}
              />
              <Button className="w-full" variant="outline" disabled={busy === 'ask' || !question.trim()} onClick={() => void askInstructor()}>
                {busy === 'ask' ? <Loader2 className="h-4 w-4 animate-spin" /> : <MessageCircleQuestion className="h-4 w-4" />}
                Ask about this lesson
              </Button>
            </CardContent>
          </Card>

          {course.prerequisites.length > 0 && (
            <Card><CardHeader className="pb-3"><CardTitle className="text-sm">Prerequisites</CardTitle></CardHeader><CardContent className="space-y-2">{course.prerequisites.map((item) => <div key={item} className="flex gap-2 text-xs text-muted-foreground"><Circle className="mt-1 h-2 w-2 shrink-0 fill-muted-foreground" />{item}</div>)}</CardContent></Card>
          )}
        </aside>
      </div>
    </div>
  );
}
