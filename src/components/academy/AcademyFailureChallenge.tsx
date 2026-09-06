'use client';

import * as React from 'react';
import { AlertTriangle, CheckCircle2, Eraser, Loader2, ShieldCheck, Wrench } from 'lucide-react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { getCsrfToken } from '@/lib/security/csrf-client';

const TEMPLATE_ID = 'synthetic-config-mismatch-v1';

type FailureEvidence = {
  provenance: 'server-executed';
  check: 'pre' | 'fault' | 'verify' | 'cleanup';
  stdout: string;
  stderr: string;
  exitCode: number;
  observedAt: string;
};

type FailureAttempt = {
  id: string;
  state: 'preparing' | 'injected' | 'remediated' | 'cleaned' | 'failed';
  workspacePath: string;
  challenge: string;
  constraints: string[];
  faultEvidence: FailureEvidence | null;
  verificationEvidence: FailureEvidence | null;
  cleanupEvidence: FailureEvidence | null;
  failureReason: string | null;
};

async function apiError(response: Response, fallback: string) {
  const body = await response.json().catch(() => ({}));
  return body?.error || fallback;
}

export default function AcademyFailureChallenge({
  courseTitle,
  lessonTitle,
  labInstanceId,
}: {
  courseTitle: string;
  lessonTitle: string;
  labInstanceId: string;
}) {
  const [attempt, setAttempt] = React.useState<FailureAttempt | null>(null);
  const [busy, setBusy] = React.useState<'inject' | 'verify' | 'cleanup' | null>(null);

  async function post(body: Record<string, unknown>) {
    const token = await getCsrfToken();
    const response = await fetch('/api/academy/failure-injection', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-csrf-token': token },
      body: JSON.stringify(body),
    });
    if (!response.ok) throw new Error(await apiError(response, 'Failure lesson request failed'));
    return response.json() as Promise<{ attempt: FailureAttempt }>;
  }

  async function inject() {
    const confirmed = window.confirm(
      'Inject the isolated OXSIG troubleshooting fault into this learner-owned lab? Only a UUID-scoped /tmp workspace will be created, and OXSIG can clean it afterward.'
    );
    if (!confirmed) return;

    setBusy('inject');
    try {
      const body = await post({
        action: 'inject',
        courseTitle,
        lessonTitle,
        labInstanceId,
        templateId: TEMPLATE_ID,
        confirm: true,
      });
      setAttempt(body.attempt);
      toast.success('Troubleshooting fault injected into the isolated workspace.');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failure injection failed');
    } finally {
      setBusy(null);
    }
  }

  async function verify() {
    if (!attempt) return;
    setBusy('verify');
    try {
      const body = await post({ action: 'verify', attemptId: attempt.id });
      setAttempt(body.attempt);
      if (body.attempt.state === 'remediated') toast.success('Remediation verified from server-executed evidence.');
      else toast.info('The synthetic application is still unhealthy. Continue diagnosing in the terminal.');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Remediation verification failed');
    } finally {
      setBusy(null);
    }
  }

  async function cleanup() {
    if (!attempt) return;
    setBusy('cleanup');
    try {
      const body = await post({ action: 'cleanup', attemptId: attempt.id });
      setAttempt(body.attempt);
      toast.success('Isolated troubleshooting workspace cleaned.');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failure workspace cleanup failed');
    } finally {
      setBusy(null);
    }
  }

  return (
    <section className="mt-4 space-y-3 rounded-xl border border-amber-500/30 bg-amber-500/5 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 font-semibold">
            <Wrench className="h-4 w-4 text-amber-600" /> Troubleshooting challenge
          </div>
          <p className="mt-1 max-w-2xl text-xs leading-5 text-muted-foreground">
            Practice diagnosis after the normal checkpoint. OXSIG injects only a curated, reversible synthetic configuration fault inside this lab.
          </p>
        </div>
        <Badge variant="outline" className="text-[10px]">Failure Injection v1</Badge>
      </div>

      {!attempt && (
        <div className="rounded-lg border bg-background/70 p-3 text-xs leading-5">
          <p className="font-medium">Safe scope</p>
          <p className="mt-1 text-muted-foreground">Creates only files under <code>/tmp/oxsig-failure-labs/&lt;attempt-id&gt;</code>. It does not stop services, alter networking, change users, or modify boot/system configuration.</p>
          <Button className="mt-3 w-full" variant="outline" onClick={() => void inject()} disabled={busy !== null}>
            {busy === 'inject' ? <Loader2 className="h-4 w-4 animate-spin" /> : <AlertTriangle className="h-4 w-4" />}
            {busy === 'inject' ? 'Injecting isolated fault…' : 'Inject troubleshooting fault'}
          </Button>
        </div>
      )}

      {attempt && attempt.state !== 'cleaned' && (
        <div className="space-y-3">
          <div className="rounded-lg bg-background/80 p-3 text-xs leading-5">
            <p className="font-medium">Challenge</p>
            <p className="mt-1 text-muted-foreground">{attempt.challenge}</p>
            <p className="mt-2 font-mono text-[10px] break-all">workspace: {attempt.workspacePath}</p>
          </div>

          <div className="space-y-1 text-[11px] text-muted-foreground">
            {attempt.constraints.map((constraint) => <p key={constraint}>• {constraint}</p>)}
          </div>

          {attempt.faultEvidence && (
            <div className="rounded-lg border bg-background/70 p-3 text-[11px]">
              <div className="flex items-center gap-2 font-medium"><ShieldCheck className="h-3.5 w-3.5 text-primary" /> Server-executed fault evidence</div>
              <pre className="mt-2 overflow-x-auto whitespace-pre-wrap text-[10px] text-muted-foreground">{attempt.faultEvidence.stdout.trim() || '(no stdout)'}</pre>
            </div>
          )}

          {attempt.verificationEvidence && (
            <div className={`rounded-lg border p-3 text-[11px] ${attempt.state === 'remediated' ? 'border-primary/30 bg-primary/5' : 'bg-background/70'}`}>
              <div className="flex items-center gap-2 font-medium">
                {attempt.state === 'remediated' ? <CheckCircle2 className="h-3.5 w-3.5 text-primary" /> : <AlertTriangle className="h-3.5 w-3.5 text-amber-600" />}
                Latest verification
              </div>
              <pre className="mt-2 overflow-x-auto whitespace-pre-wrap text-[10px] text-muted-foreground">{attempt.verificationEvidence.stdout.trim() || '(no stdout)'}</pre>
            </div>
          )}

          <div className="grid gap-2 sm:grid-cols-2">
            <Button variant="outline" onClick={() => void verify()} disabled={busy !== null}>
              {busy === 'verify' ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />}
              {busy === 'verify' ? 'Verifying…' : attempt.state === 'remediated' ? 'Verify again' : 'Verify my remediation'}
            </Button>
            <Button variant="ghost" onClick={() => void cleanup()} disabled={busy !== null}>
              {busy === 'cleanup' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Eraser className="h-4 w-4" />}
              {busy === 'cleanup' ? 'Cleaning…' : 'Clean challenge workspace'}
            </Button>
          </div>
        </div>
      )}

      {attempt?.state === 'cleaned' && (
        <div className="flex items-center gap-2 rounded-lg border bg-background/70 p-3 text-xs">
          <CheckCircle2 className="h-4 w-4 text-primary" /> Challenge workspace cleaned. No synthetic fault files remain for this attempt.
        </div>
      )}
    </section>
  );
}
