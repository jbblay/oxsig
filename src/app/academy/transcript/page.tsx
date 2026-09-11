'use client';

import * as React from 'react';
import Link from 'next/link';
import {
  Award,
  CheckCircle2,
  Download,
  FileCheck2,
  Loader2,
  ShieldCheck,
  Sparkles,
} from 'lucide-react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import type { ProvedSkillTranscript } from '@/lib/learning/transcript-model';

function formatDate(value: string | null) {
  if (!value) return '—';
  return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value));
}

function proofLabel(method: ProvedSkillTranscript['items'][number]['proofMethod']) {
  if (method === 'assessment') return 'Evidence-gated assessment';
  if (method === 'assessment+practice') return 'Assessment + practical evidence';
  return 'Practical + reflection evidence';
}

export default function AcademyTranscriptPage() {
  const [transcript, setTranscript] = React.useState<ProvedSkillTranscript | null>(null);
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const response = await fetch('/api/learning/transcript', { cache: 'no-store' });
        const body = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(body?.error || 'Could not load proved skills');
        if (!cancelled) setTranscript(body.transcript as ProvedSkillTranscript);
      } catch (error) {
        if (!cancelled) toast.error(error instanceof Error ? error.message : 'Could not load proved skills');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  function exportJson() {
    if (!transcript) return;
    const blob = new Blob([JSON.stringify(transcript, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `oxsig-proved-skills-${new Date().toISOString().slice(0, 10)}.json`;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  if (loading) {
    return <div className="flex min-h-[55vh] items-center justify-center text-sm text-muted-foreground"><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Loading proved skills…</div>;
  }

  if (!transcript) {
    return <div className="mx-auto max-w-3xl py-10"><Card><CardHeader><CardTitle>Transcript unavailable</CardTitle><CardDescription>OXSIG could not load your persisted capability evidence.</CardDescription></CardHeader><CardContent><Button asChild variant="outline"><Link href="/academy/paths">Back to learning paths</Link></Button></CardContent></Card></div>;
  }

  return (
    <div className="mx-auto max-w-6xl space-y-5 py-4">
      <section className="overflow-hidden rounded-2xl border bg-[radial-gradient(circle_at_top_right,rgba(16,185,129,0.16),transparent_34%),linear-gradient(140deg,hsl(var(--background)),hsl(var(--muted)/0.24))] p-5 sm:p-7">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="max-w-3xl">
            <Badge variant="secondary" className="mb-3 gap-1.5"><Award className="h-3.5 w-3.5" /> Proved skills transcript</Badge>
            <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">What you proved, not what you clicked.</h1>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">This transcript is reconstructed from durable capability evidence. Opening a lesson, marking a page complete, or merely authenticating to a lab does not create a proved skill.</p>
          </div>
          <Button type="button" variant="outline" onClick={exportJson} disabled={transcript.items.length === 0}><Download className="mr-2 h-4 w-4" /> Export JSON</Button>
        </div>

        <div className="mt-6 grid gap-3 sm:grid-cols-3">
          <div className="rounded-xl border bg-background/70 p-3"><p className="text-2xl font-semibold">{transcript.totalDemonstrated}</p><p className="text-xs text-muted-foreground">Capabilities demonstrated</p></div>
          <div className="rounded-xl border bg-background/70 p-3"><p className="text-2xl font-semibold">{transcript.pathsWithProof}</p><p className="text-xs text-muted-foreground">Learning paths with proof</p></div>
          <div className="rounded-xl border bg-background/70 p-3"><p className="text-sm font-semibold">{formatDate(transcript.lastDemonstratedAt)}</p><p className="mt-1 text-xs text-muted-foreground">Most recent demonstration</p></div>
        </div>
      </section>

      {transcript.items.length === 0 ? (
        <Card className="border-dashed">
          <CardHeader><CardTitle className="flex items-center gap-2"><Sparkles className="h-5 w-5" /> No proved skills yet</CardTitle><CardDescription>Your transcript starts when evidence demonstrates a capability. The fastest route is a curated path with its real practical checkpoint.</CardDescription></CardHeader>
          <CardContent><Button asChild><Link href="/academy/paths">Choose a learning path</Link></Button></CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {transcript.items.map((item) => (
            <Card key={`${item.pathId}@${item.pathVersion}:${item.capabilityId}`}>
              <CardHeader className="pb-3">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="text-xs font-medium text-muted-foreground">{item.pathTitle} · v{item.pathVersion}</p>
                    <CardTitle className="mt-1 flex items-center gap-2 text-lg"><CheckCircle2 className="h-5 w-5 text-emerald-500" /> {item.capabilityTitle}</CardTitle>
                    {item.outcome ? <CardDescription className="mt-2 max-w-3xl leading-5">{item.outcome}</CardDescription> : null}
                  </div>
                  <Badge className="gap-1.5"><ShieldCheck className="h-3.5 w-3.5" /> Demonstrated</Badge>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="grid gap-2 text-xs sm:grid-cols-3">
                  <div className="rounded-lg border bg-muted/15 p-3"><p className="font-medium">Proof method</p><p className="mt-1 text-muted-foreground">{proofLabel(item.proofMethod)}</p></div>
                  <div className="rounded-lg border bg-muted/15 p-3"><p className="font-medium">Demonstrated</p><p className="mt-1 text-muted-foreground">{formatDate(item.demonstratedAt)}</p></div>
                  <div className="rounded-lg border bg-muted/15 p-3"><p className="font-medium">Evidence records</p><p className="mt-1 text-muted-foreground">{item.evidenceCount} persisted record{item.evidenceCount === 1 ? '' : 's'}</p></div>
                </div>

                <div className="flex flex-wrap gap-2">
                  <Badge variant={item.practice.demonstrated ? 'secondary' : 'outline'} className="gap-1"><FileCheck2 className="h-3 w-3" /> Practice {item.practice.demonstrated ? 'verified' : '—'}</Badge>
                  <Badge variant={item.reflection.demonstrated ? 'secondary' : 'outline'}>Reflection {item.reflection.bestScore !== null ? `${item.reflection.bestScore}%` : item.reflection.demonstrated ? 'verified' : '—'}</Badge>
                  <Badge variant={item.assessment.demonstrated ? 'secondary' : 'outline'}>Assessment {item.assessment.bestScore !== null ? `${item.assessment.bestScore}%` : item.assessment.demonstrated ? 'verified' : '—'}</Badge>
                  <Badge variant="outline" className="font-mono text-[10px]">{item.pathId}@{item.pathVersion}/{item.capabilityId}</Badge>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
