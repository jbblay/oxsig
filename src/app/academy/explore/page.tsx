'use client';

import * as React from 'react';
import Link from 'next/link';
import { ArrowLeft, BrainCircuit, Compass, Loader2, Sparkles } from 'lucide-react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import type { AcademyCourse } from '@/lib/academy/types';
import { getCsrfToken } from '@/lib/security/csrf-client';

const MAX_PROMPT = 800;

type Exploration = {
  prompt: string;
  course: AcademyCourse;
  durable: false;
  capabilityProgressAffected: false;
};

export default function AcademyExplorePage() {
  const [prompt, setPrompt] = React.useState('');
  const [busy, setBusy] = React.useState(false);
  const [exploration, setExploration] = React.useState<Exploration | null>(null);

  async function explore() {
    const value = prompt.trim();
    if (value.length < 3) return;
    setBusy(true);
    try {
      const token = await getCsrfToken();
      const response = await fetch('/api/academy/explore', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-csrf-token': token },
        body: JSON.stringify({ prompt: value }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body?.error || 'Academy could not explore this topic');
      setExploration(body.exploration as Exploration);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Academy could not explore this topic');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-5xl space-y-6 py-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Button variant="ghost" asChild><Link href="/academy"><ArrowLeft className="h-4 w-4" /> Back to Academy</Link></Button>
        <Badge variant="outline" className="gap-1.5"><Compass className="h-3.5 w-3.5" /> Temporary exploration</Badge>
      </div>

      <section className="overflow-hidden rounded-3xl border bg-[radial-gradient(circle_at_top_right,rgba(168,85,247,0.14),transparent_38%),linear-gradient(145deg,hsl(var(--background)),hsl(var(--muted)/0.22))] p-6 sm:p-9">
        <div className="max-w-3xl">
          <Badge variant="secondary" className="gap-1.5"><Sparkles className="h-3.5 w-3.5" /> Explore / Curiosity</Badge>
          <h1 className="mt-4 text-3xl font-semibold tracking-tight sm:text-4xl">Ask about something without creating another learning path.</h1>
          <p className="mt-3 text-sm leading-6 text-muted-foreground">Use this for side questions, concepts you encountered elsewhere, or a quick technical deep dive. The result is temporary: it does not enroll you, replace your core journey, award capability evidence, or mark anything complete.</p>
        </div>

        <div className="mt-6 rounded-2xl border bg-background/75 p-3">
          <Textarea
            value={prompt}
            onChange={(event) => setPrompt(event.target.value)}
            maxLength={MAX_PROMPT}
            placeholder="For example: What exactly is an ELF file, and why does Linux use it?"
            className="min-h-[110px] resize-none border-0 bg-transparent text-base shadow-none focus-visible:ring-0"
            disabled={busy}
          />
          <div className="flex flex-wrap items-center justify-between gap-3 border-t pt-3">
            <p className="text-xs text-muted-foreground">Temporary explanation only · no enrollment · no capability progress</p>
            <Button onClick={() => void explore()} disabled={busy || prompt.trim().length < 3}>
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
              {busy ? 'Exploring…' : 'Explore topic'}
            </Button>
          </div>
        </div>
      </section>

      {exploration && (
        <section className="space-y-4">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">Temporary technical map</p>
              <h2 className="mt-1 text-2xl font-semibold">{exploration.course.title}</h2>
              <p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">{exploration.course.overview}</p>
            </div>
            <Badge variant="outline">Not added to progress</Badge>
          </div>

          <div className="space-y-3">
            {exploration.course.lessons.map((lesson, index) => (
              <Card key={lesson.id}>
                <CardHeader>
                  <div className="flex items-start gap-3">
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border text-xs font-semibold">{index + 1}</span>
                    <div>
                      <CardTitle className="text-base">{lesson.title}</CardTitle>
                      <CardDescription className="mt-1">{lesson.summary}</CardDescription>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  <p className="whitespace-pre-line text-sm leading-7">{lesson.explanation}</p>
                  <div className="grid gap-2 sm:grid-cols-2">
                    {lesson.keyPoints.map((point) => <div key={point} className="rounded-xl border bg-muted/20 p-3 text-xs leading-5">{point}</div>)}
                  </div>
                  <div className="rounded-xl border bg-muted/20 p-3">
                    <p className="flex items-center gap-2 text-xs font-semibold"><BrainCircuit className="h-4 w-4 text-primary" /> Think about it</p>
                    <p className="mt-2 text-sm leading-6 text-muted-foreground">{lesson.checkpoint}</p>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>

          <p className="rounded-2xl border border-dashed p-4 text-center text-xs text-muted-foreground">If this topic belongs in your real learning journey, return to Academy and work through the curated capability map rather than treating this temporary exploration as mastery.</p>
        </section>
      )}
    </div>
  );
}
