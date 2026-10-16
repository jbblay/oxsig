'use client';

import * as React from 'react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { getCsrfToken } from '@/lib/security/csrf-client';

export type ConceptRecord = { conceptAnswer?: string; conceptFeedback?: { answer: string; suggestedAction?: string } | null; conceptReviewedAt?: string | null };

export default function DockerConcept({ record, onSave }: { record?: ConceptRecord; onSave: () => Promise<void> }) {
  const [answer, setAnswer] = React.useState(record?.conceptAnswer || '');
  const [feedback, setFeedback] = React.useState(record?.conceptFeedback?.answer || '');
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState('');
  React.useEffect(() => { setAnswer(record?.conceptAnswer || ''); setFeedback(record?.conceptFeedback?.answer || ''); }, [record?.conceptAnswer, record?.conceptFeedback?.answer]);
  async function submit() {
    setBusy(true); setError('');
    try {
      const response = await fetch('/api/academy/missions', { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-csrf-token': await getCsrfToken() }, body: JSON.stringify({ action: 'concept', answer }) });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || 'Could not save your explanation. Try again.');
      if (!body.feedback) setError('Your explanation is saved. AI feedback is currently unavailable; continue practicing and request feedback later.');
      setFeedback(body.feedback?.answer || '');
      await onSave();
    } catch (e) { setError(e instanceof Error ? e.message : 'Concept review unavailable. You can still practice.'); }
    finally { setBusy(false); }
  }
  return <Card>
    <CardHeader><CardTitle className="text-base">Before you begin: containers and virtual machines</CardTitle><CardDescription>A container packages an application and its dependencies as isolated processes sharing the Linux host’s kernel. A virtual machine runs its own guest operating system and kernel. An image is the template; a container is a running instance.</CardDescription></CardHeader>
    <CardContent className="space-y-3">
      <label htmlFor="docker-concept" className="block text-sm font-medium">How does a container differ from a virtual machine, and why can containers start quickly?</label>
      <Textarea id="docker-concept" value={answer} onChange={e => setAnswer(e.target.value)} maxLength={2000} placeholder="Explain in your own words…" />
      <Button disabled={busy || answer.trim().length < 3} onClick={() => void submit()}>{busy ? 'Saving and reviewing…' : 'Save explanation and get feedback'}</Button>
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      {feedback && <p role="status" className="whitespace-pre-wrap rounded-lg bg-muted p-3 text-sm">{feedback}</p>}
      <p className="text-xs text-muted-foreground">Concept feedback supports your learning. Practical completion requires separate checks of your real environment. You can practice while AI is unavailable.</p>
    </CardContent>
  </Card>;
}
