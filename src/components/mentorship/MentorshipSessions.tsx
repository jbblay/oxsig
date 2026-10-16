'use client';

import * as React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { CalendarClock, DoorOpen, Loader2, ShieldCheck } from 'lucide-react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { SESSION_KIND_LABELS, type SessionStatus } from '@/lib/mentorship/scheduling';
import { mentorSpecializationLabel } from '@/lib/mentorship/specializations';
import type { MentorAvailabilityView, MentorshipSessionView } from '@/lib/mentorship/types';
import { MentorAvatar } from './MentorCard';
import { mentorshipGet, mentorshipMutate } from './mentorship-client';
import { browserTimeZone, formatInZone } from './time';

const STATUS_STYLE: Record<SessionStatus, { label: string; tone: string }> = {
  requested: { label: 'Awaiting mentor', tone: 'bg-sky-500/10 text-sky-700 dark:text-sky-300' },
  confirmed: { label: 'Confirmed', tone: 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300' },
  declined: { label: 'Declined', tone: 'bg-rose-500/10 text-rose-700 dark:text-rose-300' },
  cancelled: { label: 'Cancelled', tone: 'bg-muted text-muted-foreground' },
  expired: { label: 'Expired', tone: 'bg-muted text-muted-foreground' },
  completed: { label: 'Completed', tone: 'bg-indigo-500/10 text-indigo-700 dark:text-indigo-300' },
  no_show: { label: 'No-show', tone: 'bg-amber-500/10 text-amber-700 dark:text-amber-300' },
};

function Reschedule({ session, onDone }: { session: MentorshipSessionView; onDone: () => void }) {
  const timezone = React.useMemo(browserTimeZone, []);
  const [availability, setAvailability] = React.useState<MentorAvailabilityView | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);

  React.useEffect(() => {
    if (!session.counterpart.id || !session.offeringId) {
      setError('This session type is no longer offered. Cancel and book a new session.');
      return;
    }
    mentorshipGet<MentorAvailabilityView>(`/api/mentors/${session.counterpart.id}/availability?offeringId=${session.offeringId}`)
      .then(setAvailability)
      .catch((cause) => setError(cause instanceof Error ? cause.message : 'Could not load availability'));
  }, [session.counterpart.id, session.offeringId]);

  async function choose(startsAt: string) {
    setBusy(true);
    try {
      await mentorshipMutate(`/api/mentorship/sessions/${session.id}`, 'PATCH', { action: 'reschedule', startsAt });
      toast.success('Reschedule requested. The mentor will confirm the new time.');
      onDone();
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : 'Could not reschedule');
      setBusy(false);
    }
  }

  if (error) return <p className="text-xs text-destructive">{error}</p>;
  if (!availability) return <p className="flex items-center text-xs text-muted-foreground"><Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> Loading open times…</p>;
  if (!availability.slots.length) return <p className="text-xs text-muted-foreground">No other open times in the next two weeks.</p>;
  return (
    <div className="flex max-h-40 flex-wrap gap-1.5 overflow-y-auto">
      {availability.slots.slice(0, 60).map((slot) => (
        <button key={slot} type="button" disabled={busy} onClick={() => void choose(slot)} className="rounded-md border px-2 py-1 text-xs hover:bg-muted">
          {formatInZone(slot, timezone, { dateStyle: 'short', timeStyle: 'short' })}
        </button>
      ))}
    </div>
  );
}

function SessionCard({ session, onChanged }: { session: MentorshipSessionView; onChanged: () => void }) {
  const router = useRouter();
  const timezone = React.useMemo(browserTimeZone, []);
  const [busy, setBusy] = React.useState(false);
  const [summary, setSummary] = React.useState(session.mentorSummary ?? '');
  const [rescheduling, setRescheduling] = React.useState(false);
  const can = (action: MentorshipSessionView['allowedActions'][number]) => session.allowedActions.includes(action);
  const status = STATUS_STYLE[session.status];

  async function run(body: Record<string, unknown>, success: string) {
    setBusy(true);
    try {
      await mentorshipMutate(`/api/mentorship/sessions/${session.id}`, 'PATCH', body);
      toast.success(success);
      onChanged();
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : 'Update failed');
    } finally {
      setBusy(false);
    }
  }

  function withReason(action: 'cancel' | 'decline', prompt: string) {
    const reason = window.prompt(prompt);
    if (reason && reason.trim().length >= 3) void run({ action, reason: reason.trim() }, action === 'cancel' ? 'Session cancelled' : 'Request declined');
  }

  async function joinRoom() {
    setBusy(true);
    try {
      const room = await mentorshipMutate<{ href: string }>(`/api/mentorship/sessions/${session.id}/room`, 'POST', {});
      router.push(room.href);
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : 'Could not open the Rescue Room');
      setBusy(false);
    }
  }

  const context = 'type' in session.sharedContext && session.sharedContext.type === 'academy_lesson' ? session.sharedContext : null;

  return (
    <li>
      <Card>
        <CardHeader className="pb-3">
          <div className="flex flex-wrap items-center gap-3">
            <MentorAvatar name={session.counterpart.displayName} src={session.counterpart.avatarUrl} size={36} />
            <div className="min-w-0 flex-1">
              <CardTitle className="truncate text-sm">{session.topic}</CardTitle>
              <p className="text-xs text-muted-foreground">
                {session.role === 'learner' ? 'with ' : 'for '}{session.counterpart.displayName} · {SESSION_KIND_LABELS[session.kind]} · {session.durationMinutes} min · {mentorSpecializationLabel(session.specializationId)}
              </p>
            </div>
            <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${status.tone}`}>{status.label}</span>
          </div>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <p className="flex items-center gap-1.5 text-xs"><CalendarClock className="h-3.5 w-3.5" aria-hidden="true" /> {formatInZone(session.startsAt, timezone)} <span className="text-muted-foreground">({timezone})</span></p>
          <div className="grid gap-2 text-xs sm:grid-cols-2">
            <div><p className="font-medium">Goal</p><p className="whitespace-pre-line text-muted-foreground">{session.learnerGoal}</p></div>
            {session.attemptedSummary ? <div><p className="font-medium">Already tried</p><p className="whitespace-pre-line text-muted-foreground">{session.attemptedSummary}</p></div> : null}
          </div>
          {context ? (
            <div className="rounded-lg border bg-muted/20 p-2.5 text-xs">
              <p className="font-medium">Shared Academy context</p>
              <p className="text-muted-foreground">{context.courseTitle} → {context.lessonTitle}</p>
              {context.practiceInstruction ? <p className="mt-1 text-muted-foreground">Practice: {context.practiceInstruction}</p> : null}
            </div>
          ) : null}
          {session.mentorNote ? <p className="text-xs"><span className="font-medium">Mentor note:</span> {session.mentorNote}</p> : null}
          {session.cancellationReason ? <p className="text-xs text-muted-foreground">Reason: {session.cancellationReason}{session.lateCancellation ? ' (late cancellation)' : ''}</p> : null}
          {session.mentorSummary && !can('summary') ? (
            <div className="rounded-lg border border-indigo-500/20 bg-indigo-500/[0.04] p-2.5 text-xs"><p className="font-medium">Session summary</p><p className="whitespace-pre-line text-muted-foreground">{session.mentorSummary}</p></div>
          ) : null}

          {session.status === 'confirmed' ? (
            <div className="flex flex-wrap items-center gap-2 rounded-lg border border-emerald-500/20 bg-emerald-500/[0.04] p-2.5 text-xs">
              <ShieldCheck className="h-4 w-4 text-emerald-600" aria-hidden="true" />
              <span className="min-w-0 flex-1">
                {session.room.open
                  ? `Rescue Room is open until ${formatInZone(session.room.expiresAt, timezone, { dateStyle: undefined, timeStyle: 'short' })}.`
                  : `Rescue Room opens ${formatInZone(session.room.opensAt, timezone)}.`}
                {session.role === 'learner' ? ' You choose what to share; the mentor sees only what you attach.' : ' You will see only what the learner attaches.'}
              </span>
              <Button size="sm" onClick={() => void joinRoom()} disabled={busy || !session.room.open}><DoorOpen className="mr-1.5 h-3.5 w-3.5" /> Join Rescue Room</Button>
            </div>
          ) : null}

          {(can('complete') || can('summary')) ? (
            <label className="flex flex-col gap-1 text-xs font-medium">
              Session summary for the learner
              <Textarea rows={3} value={summary} maxLength={4000} onChange={(event) => setSummary(event.target.value)} placeholder="What you covered, what they solved, what to practise next" />
            </label>
          ) : null}

          <div className="flex flex-wrap gap-2">
            {can('confirm') ? <Button size="sm" disabled={busy} onClick={() => void run({ action: 'confirm' }, 'Session confirmed')}>Confirm</Button> : null}
            {can('decline') ? <Button size="sm" variant="outline" disabled={busy} onClick={() => withReason('decline', 'Let the learner know why (they will see this)')}>Decline</Button> : null}
            {can('complete') ? <Button size="sm" disabled={busy} onClick={() => void run({ action: 'complete', ...(summary.trim() ? { summary } : {}) }, 'Session completed')}>Mark complete</Button> : null}
            {can('summary') ? <Button size="sm" variant="outline" disabled={busy || summary.trim().length < 10} onClick={() => void run({ action: 'summary', summary }, 'Summary saved')}>Save summary</Button> : null}
            {can('no_show') ? <Button size="sm" variant="outline" disabled={busy} onClick={() => void run({ action: 'no_show' }, 'Recorded as no-show')}>Learner didn&apos;t attend</Button> : null}
            {can('reschedule') ? <Button size="sm" variant="outline" disabled={busy} onClick={() => setRescheduling((value) => !value)}>Reschedule</Button> : null}
            {can('cancel') ? <Button size="sm" variant="ghost" disabled={busy} onClick={() => withReason('cancel', 'Reason for cancelling (shared with the other person)')}>Cancel</Button> : null}
          </div>
          {rescheduling ? <Reschedule session={session} onDone={() => { setRescheduling(false); onChanged(); }} /> : null}
        </CardContent>
      </Card>
    </li>
  );
}

export default function MentorshipSessions() {
  const [sessions, setSessions] = React.useState<MentorshipSessionView[] | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [role, setRole] = React.useState<'learner' | 'mentor'>('learner');

  const load = React.useCallback(async () => {
    try {
      const body = await mentorshipGet<{ sessions: MentorshipSessionView[] }>('/api/mentorship/sessions');
      setSessions(body.sessions);
      setError(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not load sessions');
    }
  }, []);
  React.useEffect(() => { void load(); }, [load]);

  const hasMentorSessions = Boolean(sessions?.some((item) => item.role === 'mentor'));
  const mine = (sessions ?? []).filter((item) => item.role === role);
  const now = Date.now();
  const upcoming = mine.filter((item) => ['requested', 'confirmed'].includes(item.status) && new Date(item.endsAt).getTime() > now).reverse();
  const past = mine.filter((item) => !upcoming.includes(item));

  return (
    <div className="mx-auto max-w-4xl space-y-5 py-4">
      <section className="rounded-2xl border bg-gradient-to-r from-primary/10 via-background to-emerald-500/10 p-5 sm:p-7">
        <Badge variant="secondary" className="mb-3 gap-1.5"><CalendarClock className="h-3.5 w-3.5" aria-hidden="true" /> My mentorship sessions</Badge>
        <h1 className="text-2xl font-semibold tracking-tight">Human help, on your terms.</h1>
        <p className="mt-2 text-sm text-muted-foreground">Sessions are free during the pilot. Rescue Rooms close automatically when the session ends.</p>
      </section>

      {hasMentorSessions ? (
        <div className="inline-flex gap-1 rounded-lg border p-0.5" role="tablist">
          {(['learner', 'mentor'] as const).map((value) => (
            <button key={value} type="button" role="tab" aria-selected={role === value} onClick={() => setRole(value)} className={`rounded-md px-3 py-1.5 text-xs font-medium ${role === value ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted'}`}>
              {value === 'learner' ? 'Getting help' : 'Mentoring'}
            </button>
          ))}
        </div>
      ) : null}

      {error ? <p role="alert" className="rounded-lg border p-4 text-sm">{error}</p> : sessions === null ? (
        <p className="flex items-center justify-center py-16 text-sm text-muted-foreground"><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Loading sessions…</p>
      ) : (
        <>
          <section className="space-y-3">
            <h2 className="text-sm font-semibold">Upcoming</h2>
            {upcoming.length ? <ul className="space-y-3">{upcoming.map((item) => <SessionCard key={item.id} session={item} onChanged={() => void load()} />)}</ul> : (
              <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
                Nothing scheduled. {role === 'learner' ? <Link className="text-primary underline" href="/academy/mentors">Find a mentor</Link> : 'New requests appear here.'}
              </p>
            )}
          </section>
          {past.length ? (
            <section className="space-y-3">
              <h2 className="text-sm font-semibold">History</h2>
              <ul className="space-y-3">{past.map((item) => <SessionCard key={item.id} session={item} onChanged={() => void load()} />)}</ul>
            </section>
          ) : null}
        </>
      )}
    </div>
  );
}
