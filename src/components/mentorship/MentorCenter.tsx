'use client';

import * as React from 'react';
import Link from 'next/link';
import { AlertTriangle, CheckCircle2, Circle, GraduationCap, Loader2, Pause, Play, Save, Sparkles, Undo2 } from 'lucide-react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { MENTOR_PROGRESSION, MENTOR_TIER_LABELS } from '@/lib/mentorship/policy';
import { MENTOR_SPECIALIZATIONS, mentorSpecializationLabel } from '@/lib/mentorship/specializations';
import type { MentorApplicationSummary, MentorCenterState, MentorOwnProfile } from '@/lib/mentorship/types';
import MentorApplicationForm from './MentorApplicationForm';
import { mentorshipGet, mentorshipMutate } from './mentorship-client';

const STATUS_COPY: Record<MentorApplicationSummary['status'], { label: string; tone: string }> = {
  submitted: { label: 'Submitted', tone: 'bg-sky-500/10 text-sky-700 dark:text-sky-300' },
  under_review: { label: 'Under review', tone: 'bg-indigo-500/10 text-indigo-700 dark:text-indigo-300' },
  changes_requested: { label: 'Changes requested', tone: 'bg-amber-500/10 text-amber-700 dark:text-amber-300' },
  approved: { label: 'Approved', tone: 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300' },
  rejected: { label: 'Not approved', tone: 'bg-rose-500/10 text-rose-700 dark:text-rose-300' },
  withdrawn: { label: 'Withdrawn', tone: 'bg-muted text-muted-foreground' },
};

function StatusPill({ status }: { status: MentorApplicationSummary['status'] }) {
  const copy = STATUS_COPY[status];
  return <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${copy.tone}`}>{copy.label}</span>;
}

function ProgressionLadder({ stage }: { stage: MentorCenterState['stage'] }) {
  const current = MENTOR_PROGRESSION.findIndex((item) => item.stage === stage);
  return (
    <ol className="grid gap-2 sm:grid-cols-3 lg:grid-cols-6" aria-label="Mentor progression">
      {MENTOR_PROGRESSION.map((item, index) => {
        const done = index < current;
        const active = index === current;
        return (
          <li
            key={item.stage}
            aria-current={active ? 'step' : undefined}
            className={`rounded-lg border p-2.5 ${active ? 'border-primary bg-primary/[0.06]' : done ? 'border-emerald-500/30' : 'opacity-70'}`}
          >
            <p className="flex items-center gap-1.5 text-xs font-medium">
              {done ? <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" aria-hidden="true" /> : <Circle className={`h-3.5 w-3.5 ${active ? 'text-primary' : 'text-muted-foreground'}`} aria-hidden="true" />}
              {item.label}
            </p>
            <p className="mt-1 text-[11px] leading-4 text-muted-foreground">{item.requirement}</p>
          </li>
        );
      })}
    </ol>
  );
}

function EligibilityPanel({ state }: { state: MentorCenterState }) {
  const academy = MENTOR_SPECIALIZATIONS.filter((item) => item.academyEvidence);
  const externalOnly = MENTOR_SPECIALIZATIONS.filter((item) => !item.academyEvidence);
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Academy evidence toward mentoring</CardTitle>
        <CardDescription>Only verified capability evidence counts — assessments, or a passed practice plus a reflection. XP does not.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {academy.map((item) => {
          const result = state.eligibility.specializations.find((entry) => entry.specializationId === item.id);
          const demonstrated = result?.demonstrated ?? 0;
          const required = result?.required ?? 1;
          const percent = Math.min(100, Math.round((demonstrated / required) * 100));
          return (
            <div key={item.id} className="space-y-1">
              <div className="flex items-center justify-between text-xs">
                <span className="font-medium">{item.label}</span>
                <span className={result?.eligible ? 'font-medium text-emerald-600 dark:text-emerald-400' : 'text-muted-foreground'}>
                  {result?.eligible ? 'Eligible' : `${demonstrated}/${required} capabilities`}
                </span>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-muted" role="progressbar" aria-valuemin={0} aria-valuemax={required} aria-valuenow={demonstrated} aria-label={`${item.label} evidence`}>
                <div className={`h-full rounded-full ${result?.eligible ? 'bg-emerald-500' : 'bg-primary'}`} style={{ width: `${percent}%` }} />
              </div>
            </div>
          );
        })}
        <p className="text-[11px] text-muted-foreground">
          No Academy evidence pathway yet for: {externalOnly.map((item) => item.label).join(', ')}. These are reviewed for industry professionals only.
        </p>
        <Button variant="outline" size="sm" asChild><Link href="/academy/paths"><GraduationCap className="mr-1.5 h-4 w-4" aria-hidden="true" /> Build evidence in learning paths</Link></Button>
      </CardContent>
    </Card>
  );
}

function ProfileEditor({ profile, onSaved }: { profile: MentorOwnProfile; onSaved: () => void }) {
  const [headline, setHeadline] = React.useState(profile.headline);
  const [bio, setBio] = React.useState(profile.bio);
  const [timezone, setTimezone] = React.useState(profile.timezone);
  const [availabilityNote, setAvailabilityNote] = React.useState(profile.availabilityNote);
  const [isListed, setIsListed] = React.useState(profile.isListed);
  const [busy, setBusy] = React.useState(false);
  const locked = profile.status === 'suspended' || profile.status === 'revoked';

  async function save(extra: { paused?: boolean } = {}) {
    setBusy(true);
    try {
      await mentorshipMutate('/api/mentors/me/profile', 'PATCH', { headline, bio, timezone, availabilityNote, isListed, ...extra });
      toast.success('Mentor profile updated');
      onSaved();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not update profile');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-center gap-2">
          <CardTitle className="text-base">Your mentor profile</CardTitle>
          <Badge>{MENTOR_TIER_LABELS[profile.tier]}</Badge>
          <Badge variant={profile.status === 'active' ? 'secondary' : 'destructive'} className="capitalize">{profile.status}</Badge>
        </div>
        <CardDescription>Tier and qualifications are granted by administrators. You control how you present yourself and whether you are listed.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {locked ? (
          <p role="alert" className="flex gap-2 rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
            This profile is {profile.status}{profile.statusReason ? `: ${profile.statusReason}` : '.'} It is hidden from the directory.
          </p>
        ) : null}
        <div>
          <p className="mb-1.5 text-xs font-medium">Approved specializations</p>
          <div className="flex flex-wrap gap-1.5">
            {profile.qualifications.length
              ? profile.qualifications.map((item) => <Badge key={item.id} variant="outline">{mentorSpecializationLabel(item.specializationId)}</Badge>)
              : <span className="text-xs text-muted-foreground">No active qualifications.</span>}
          </div>
        </div>
        <fieldset disabled={locked || busy} className="grid gap-3 sm:grid-cols-2">
          <label className="flex flex-col gap-1.5 text-xs font-medium sm:col-span-2">Headline<Input value={headline} onChange={(event) => setHeadline(event.target.value)} maxLength={120} /></label>
          <label className="flex flex-col gap-1.5 text-xs font-medium sm:col-span-2">About<Textarea value={bio} onChange={(event) => setBio(event.target.value)} rows={5} maxLength={4000} /></label>
          <label className="flex flex-col gap-1.5 text-xs font-medium">Time zone<Input value={timezone} onChange={(event) => setTimezone(event.target.value)} /></label>
          <label className="flex flex-col gap-1.5 text-xs font-medium">Availability note<Input value={availabilityNote} onChange={(event) => setAvailabilityNote(event.target.value)} maxLength={500} placeholder="e.g. Weekday evenings" /></label>
          <label className="flex items-center gap-2 text-sm sm:col-span-2"><input type="checkbox" checked={isListed} onChange={(event) => setIsListed(event.target.checked)} /> Show me in Find a mentor</label>
        </fieldset>
        {!locked ? (
          <div className="flex flex-wrap gap-2">
            <Button type="button" onClick={() => void save()} disabled={busy}>{busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />} Save profile</Button>
            <Button type="button" variant="outline" onClick={() => void save({ paused: profile.status !== 'paused' })} disabled={busy}>
              {profile.status === 'paused' ? <><Play className="mr-2 h-4 w-4" /> Resume mentoring</> : <><Pause className="mr-2 h-4 w-4" /> Pause mentoring</>}
            </Button>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}

function OpenApplication({ application, state, onChanged }: { application: MentorApplicationSummary; state: MentorCenterState; onChanged: () => void }) {
  const [busy, setBusy] = React.useState(false);
  const [editing, setEditing] = React.useState(false);

  async function withdraw() {
    if (!window.confirm('Withdraw this mentor application?')) return;
    setBusy(true);
    try {
      await mentorshipMutate('/api/mentors/me/application', 'POST', { action: 'withdraw', applicationId: application.id });
      toast.success('Application withdrawn');
      onChanged();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not withdraw');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="border-primary/30">
      <CardHeader>
        <div className="flex flex-wrap items-center gap-2">
          <CardTitle className="text-base">Your application</CardTitle>
          <StatusPill status={application.status} />
          <Badge variant="outline">{application.track === 'academy' ? 'Academy-grown' : 'Industry professional'}</Badge>
        </div>
        <CardDescription>Submitted {new Date(application.submittedAt).toLocaleString()} · {application.specializations.map(mentorSpecializationLabel).join(', ')}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {application.status === 'changes_requested' && application.decisionNote ? (
          <div className="rounded-lg border border-amber-500/30 bg-amber-500/[0.06] p-3 text-sm">
            <p className="font-medium">Reviewer feedback</p>
            <p className="mt-1 whitespace-pre-line text-muted-foreground">{application.decisionNote}</p>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">An administrator will review your evidence, conduct and teaching potential. You will get a notification when the status changes.</p>
        )}
        {editing ? (
          <MentorApplicationForm eligibility={state.eligibility} existing={application} onDone={() => { setEditing(false); onChanged(); }} />
        ) : (
          <div className="flex flex-wrap gap-2">
            {application.status === 'changes_requested' ? <Button type="button" onClick={() => setEditing(true)}>Update and resubmit</Button> : null}
            <Button type="button" variant="outline" onClick={() => void withdraw()} disabled={busy}><Undo2 className="mr-2 h-4 w-4" aria-hidden="true" /> Withdraw</Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default function MentorCenter() {
  const [state, setState] = React.useState<MentorCenterState | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [applying, setApplying] = React.useState(false);

  const load = React.useCallback(async () => {
    try {
      setState(await mentorshipGet<MentorCenterState>('/api/mentors/me'));
      setError(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not load Mentor center');
    }
  }, []);

  React.useEffect(() => { void load(); }, [load]);

  if (error) return <p role="alert" className="mx-auto max-w-3xl rounded-lg border p-6 text-sm">{error}</p>;
  if (!state) return <div className="flex min-h-[40vh] items-center justify-center text-sm text-muted-foreground"><Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" /> Loading Mentor center…</div>;

  const stageLabel = MENTOR_PROGRESSION.find((item) => item.stage === state.stage)?.label ?? 'Learner';
  const history = state.applications.filter((item) => item.id !== state.openApplication?.id);

  return (
    <div className="mx-auto max-w-6xl space-y-5 py-4">
      <section className="rounded-2xl border bg-gradient-to-r from-primary/10 via-background to-emerald-500/10 p-5 sm:p-7">
        <Badge variant="secondary" className="mb-3 gap-1.5"><Sparkles className="h-3.5 w-3.5" aria-hidden="true" /> Mentor center</Badge>
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">You are: {stageLabel}</h1>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">
          Mentoring is earned through proved capability, demonstrated teaching and administrator review. Learn, build and prove — then help others do the same.
        </p>
      </section>

      <ProgressionLadder stage={state.stage} />

      <div className="grid gap-5 lg:grid-cols-[1fr_360px]">
        <div className="min-w-0 space-y-5">
          {state.profile ? <ProfileEditor profile={state.profile} onSaved={() => void load()} /> : null}
          {state.openApplication ? <OpenApplication application={state.openApplication} state={state} onChanged={() => void load()} /> : null}

          {!state.openApplication && !(state.profile && ['active', 'paused', 'suspended'].includes(state.profile.status)) ? (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Apply to mentor</CardTitle>
                <CardDescription>
                  {state.canApply ? 'Academy-grown learners apply with verified evidence; experienced professionals apply with their record.' : state.applyBlockedReason}
                </CardDescription>
              </CardHeader>
              <CardContent>
                {state.canApply ? (
                  applying
                    ? <MentorApplicationForm eligibility={state.eligibility} existing={null} onDone={() => { setApplying(false); void load(); }} />
                    : <Button type="button" onClick={() => setApplying(true)}>Start application</Button>
                ) : null}
              </CardContent>
            </Card>
          ) : null}

          {history.length ? (
            <Card>
              <CardHeader><CardTitle className="text-base">Application history</CardTitle></CardHeader>
              <CardContent>
                <ul className="divide-y text-sm">
                  {history.map((item) => (
                    <li key={item.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                      <span>{new Date(item.submittedAt).toLocaleDateString()} · {item.track === 'academy' ? 'Academy-grown' : 'Professional'}</span>
                      <span className="flex items-center gap-2"><StatusPill status={item.status} />{item.decisionNote && item.status === 'rejected' ? <span className="max-w-xs truncate text-xs text-muted-foreground" title={item.decisionNote}>{item.decisionNote}</span> : null}</span>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          ) : null}
        </div>
        <EligibilityPanel state={state} />
      </div>
    </div>
  );
}
