'use client';

import * as React from 'react';
import { BadgeCheck, ClipboardCheck, Inbox, Loader2, ShieldAlert, UserCheck } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import type { getMentorApplicationForReview, listMentorApplicationsForReview, listMentorsForAdmin } from '@/lib/mentorship/admin';
import { INITIAL_TIERS_BY_TRACK, MENTOR_TIERS, MENTOR_TIER_LABELS, type MentorTier } from '@/lib/mentorship/policy';
import { MENTOR_SPECIALIZATIONS, mentorSpecializationLabel } from '@/lib/mentorship/specializations';
import {
  Avatar,
  EmptyState,
  ErrorState,
  LoadingRows,
  Panel,
  PanelHeader,
  Pill,
  RefreshButton,
  Segmented,
  adminMutate,
  formatDateTime,
  timeAgo,
  useAdminResource,
  type Tone,
} from './admin-ui';

type ApplicationList = Awaited<ReturnType<typeof listMentorApplicationsForReview>>;
type ApplicationDetail = NonNullable<Awaited<ReturnType<typeof getMentorApplicationForReview>>>;
type AdminMentor = Awaited<ReturnType<typeof listMentorsForAdmin>>[number];

type StatusFilter = 'open' | 'approved' | 'rejected' | 'withdrawn' | 'all';

const APPLICATION_TONE: Record<string, Tone> = {
  submitted: 'info',
  under_review: 'brand',
  changes_requested: 'warn',
  approved: 'good',
  rejected: 'bad',
  withdrawn: 'neutral',
};

const MENTOR_TONE: Record<string, Tone> = { active: 'good', paused: 'neutral', suspended: 'warn', revoked: 'bad' };

const label = (value: string) => value.replace(/_/g, ' ');

function ApplicationReview({ id, currentAdminId, onChanged }: { id: string; currentAdminId: string | null; onChanged: () => void }) {
  const { data, error, loading, reload } = useAdminResource<ApplicationDetail>(`/api/admin/mentor-applications/${id}`);
  const [note, setNote] = React.useState('');
  const [reviewerNote, setReviewerNote] = React.useState('');
  const [tier, setTier] = React.useState<MentorTier>('approved_peer_mentor');
  const [specializations, setSpecializations] = React.useState<string[]>([]);
  const [verified, setVerified] = React.useState<number[]>([]);
  const [busy, setBusy] = React.useState(false);

  React.useEffect(() => {
    if (!data) return;
    const { application, currentEligibility } = data;
    setTier('approved_peer_mentor');
    setVerified([]);
    setSpecializations(
      application.track === 'academy'
        ? application.specializations.filter((item) => currentEligibility.specializations.find((entry) => entry.specializationId === item)?.eligible)
        : application.specializations
    );
  }, [data]);

  if (loading && !data) return <LoadingRows rows={4} />;
  if (error || !data) return <ErrorState message={error || 'Application not found'} onRetry={reload} />;

  const { application, applicant, currentEligibility } = data;
  const open = ['submitted', 'under_review', 'changes_requested'].includes(application.status);
  const ownApplication = applicant?.id === currentAdminId;

  async function decide(body: Record<string, unknown>) {
    setBusy(true);
    try {
      await adminMutate(`/api/admin/mentor-applications/${id}`, 'PATCH', { ...body, ...(reviewerNote.trim() ? { reviewerNote: reviewerNote.trim() } : {}) });
      toast.success('Decision recorded');
      setNote('');
      onChanged();
      void reload();
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : 'Decision failed');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4 p-4">
      <div className="flex flex-wrap items-center gap-3">
        <Avatar name={applicant?.displayName || applicant?.email} src={applicant?.avatarUrl} size={40} />
        <div className="min-w-0 flex-1">
          <p className="font-medium">{applicant?.displayName || 'Unnamed applicant'}</p>
          <p className="text-xs text-muted-foreground">{applicant?.email}{applicant?.emailVerified ? ' · verified email' : ' · email not verified'} · joined {timeAgo(applicant?.joinedAt)}</p>
        </div>
        <Pill tone={APPLICATION_TONE[application.status]}>{label(application.status)}</Pill>
        <Pill tone="brand">{application.track === 'academy' ? 'Academy-grown' : 'External professional'}</Pill>
      </div>

      {applicant?.suspended ? <p className="rounded-lg border border-rose-500/30 bg-rose-500/5 p-2 text-xs">This account is suspended.</p> : null}

      <section className="space-y-2 text-sm">
        <p className="font-medium">{application.headline}</p>
        <p className="whitespace-pre-line text-muted-foreground">{application.bio}</p>
        <dl className="grid gap-2 text-xs sm:grid-cols-2">
          <div><dt className="font-medium">Experience</dt><dd className="text-muted-foreground">{application.yearsExperience} years</dd></div>
          <div><dt className="font-medium">Time zone</dt><dd className="text-muted-foreground">{application.timezone}</dd></div>
          <div className="sm:col-span-2"><dt className="font-medium">Motivation</dt><dd className="whitespace-pre-line text-muted-foreground">{application.motivation}</dd></div>
          {application.teachingBackground ? <div className="sm:col-span-2"><dt className="font-medium">Teaching background</dt><dd className="whitespace-pre-line text-muted-foreground">{application.teachingBackground}</dd></div> : null}
          {application.profileUrl ? <div className="sm:col-span-2"><dt className="font-medium">Profile link</dt><dd><a className="text-primary underline" href={application.profileUrl} target="_blank" rel="noopener noreferrer nofollow">{application.profileUrl}</a></dd></div> : null}
          <div className="sm:col-span-2"><dt className="font-medium">Code of conduct</dt><dd className="text-muted-foreground">v{data.codeOfConduct.version} accepted {formatDateTime(data.codeOfConduct.acceptedAt)}</dd></div>
        </dl>
      </section>

      <section className="space-y-2">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Current Academy evidence (live)</p>
        <ul className="grid gap-1.5 sm:grid-cols-2">
          {application.specializations.map((id) => {
            const result = currentEligibility.specializations.find((entry) => entry.specializationId === id);
            return (
              <li key={id} className="flex items-center justify-between rounded-md border px-2 py-1.5 text-xs">
                <span>{mentorSpecializationLabel(id)}</span>
                {result?.academyEvidenceAvailable
                  ? <Pill tone={result.eligible ? 'good' : 'warn'}>{result.demonstrated}/{result.required}</Pill>
                  : <Pill>no academy pathway</Pill>}
              </li>
            );
          })}
        </ul>
      </section>

      {application.credentials.length ? (
        <section className="space-y-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Claimed credentials — tick only those you have verified</p>
          <ul className="space-y-1.5">
            {application.credentials.map((credential, index) => (
              <li key={index} className="flex items-start gap-2 rounded-md border px-2 py-1.5 text-xs">
                <input
                  type="checkbox"
                  aria-label={`Verified ${credential.name}`}
                  disabled={!open || ownApplication}
                  checked={verified.includes(index)}
                  onChange={() => setVerified((current) => (current.includes(index) ? current.filter((item) => item !== index) : [...current, index]))}
                />
                <span className="min-w-0 flex-1">
                  {credential.name} · {credential.issuer}{credential.year ? ` · ${credential.year}` : ''}
                  {credential.url ? <> · <a className="text-primary underline" href={credential.url} target="_blank" rel="noopener noreferrer nofollow">link</a></> : null}
                </span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {open ? (
        ownApplication ? (
          <p className="flex gap-2 rounded-lg border border-amber-500/30 bg-amber-500/5 p-3 text-xs"><ShieldAlert className="h-4 w-4 shrink-0" /> You cannot review your own application. Another administrator must decide.</p>
        ) : (
          <section className="space-y-3 rounded-lg border bg-muted/20 p-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Decision</p>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="flex flex-col gap-1 text-xs font-medium">
                Tier at approval
                <select value={tier} onChange={(event) => setTier(event.target.value as MentorTier)} className="h-8 rounded-md border bg-background px-2 text-sm">
                  {INITIAL_TIERS_BY_TRACK[application.track].map((item) => <option key={item} value={item}>{MENTOR_TIER_LABELS[item]}</option>)}
                </select>
              </label>
              <fieldset className="text-xs">
                <legend className="mb-1 font-medium">Approve specializations</legend>
                {application.specializations.map((id) => (
                  <label key={id} className="flex items-center gap-1.5">
                    <input type="checkbox" checked={specializations.includes(id)} onChange={() => setSpecializations((current) => (current.includes(id) ? current.filter((item) => item !== id) : [...current, id]))} />
                    {mentorSpecializationLabel(id)}
                  </label>
                ))}
              </fieldset>
            </div>
            <label className="flex flex-col gap-1 text-xs font-medium">
              Note to applicant <span className="font-normal text-muted-foreground">(required for changes or rejection)</span>
              <Textarea rows={3} value={note} onChange={(event) => setNote(event.target.value)} maxLength={1000} />
            </label>
            <label className="flex flex-col gap-1 text-xs font-medium">
              Internal reviewer note <span className="font-normal text-muted-foreground">(never shown to the applicant)</span>
              <Textarea rows={2} value={reviewerNote} onChange={(event) => setReviewerNote(event.target.value)} maxLength={2000} />
            </label>
            <div className="flex flex-wrap gap-2">
              {application.status === 'submitted' ? <Button size="sm" variant="outline" disabled={busy} onClick={() => void decide({ action: 'start_review' })}>Start review</Button> : null}
              {application.status !== 'changes_requested' ? <Button size="sm" variant="outline" disabled={busy || note.trim().length < 10} onClick={() => void decide({ action: 'request_changes', note })}>Request changes</Button> : null}
              <Button size="sm" variant="destructive" disabled={busy || note.trim().length < 10} onClick={() => void decide({ action: 'reject', note })}>Reject</Button>
              {application.status !== 'changes_requested' ? (
                <Button size="sm" disabled={busy || specializations.length === 0} onClick={() => void decide({ action: 'approve', tier, specializationIds: specializations, verifiedCredentialIndexes: verified, ...(note.trim() ? { note } : {}) })}>
                  {busy ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <UserCheck className="mr-1.5 h-3.5 w-3.5" />} Approve
                </Button>
              ) : null}
            </div>
          </section>
        )
      ) : null}

      <section className="space-y-1.5">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Review trail</p>
        <ol className="space-y-1 text-xs">
          {data.events.map((event) => (
            <li key={event.id} className="rounded-md border px-2 py-1.5">
              <span className="font-medium">{event.fromStatus ? `${label(event.fromStatus)} → ` : ''}{label(event.toStatus)}</span>
              <span className="text-muted-foreground"> · {event.actorKind}{event.actorName ? ` (${event.actorName})` : ''} · {formatDateTime(event.at)}</span>
              {event.note ? <p className="mt-0.5 whitespace-pre-line text-muted-foreground">{event.note}</p> : null}
            </li>
          ))}
        </ol>
      </section>
    </div>
  );
}

function MentorRow({ mentor, currentAdminId, onChanged }: { mentor: AdminMentor; currentAdminId: string | null; onChanged: () => void }) {
  const [busy, setBusy] = React.useState(false);
  const self = mentor.mentorId === currentAdminId;

  async function run(body: Record<string, unknown>, prompt: string) {
    const reason = window.prompt(prompt);
    if (!reason || reason.trim().length < 5) return;
    setBusy(true);
    try {
      await adminMutate(`/api/admin/mentors/${mentor.mentorId}`, 'PATCH', { ...body, reason: reason.trim() });
      toast.success('Mentor updated');
      onChanged();
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : 'Update failed');
    } finally {
      setBusy(false);
    }
  }

  const missing = MENTOR_SPECIALIZATIONS.filter((item) => !mentor.qualifications.some((qualification) => qualification.specializationId === item.id));

  return (
    <li className="space-y-2 px-4 py-3">
      <div className="flex flex-wrap items-center gap-3">
        <Avatar name={mentor.displayName || mentor.email} src={mentor.avatarUrl} />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium">{mentor.displayName || mentor.email}</p>
          <p className="truncate text-xs text-muted-foreground">{mentor.headline}</p>
        </div>
        <Pill tone="brand">{MENTOR_TIER_LABELS[mentor.tier]}</Pill>
        <Pill tone={MENTOR_TONE[mentor.status]}>{mentor.status}</Pill>
        {!mentor.isListed ? <Pill>unlisted</Pill> : null}
      </div>
      {mentor.statusReason ? <p className="text-xs text-muted-foreground">Reason: {mentor.statusReason}</p> : null}
      <div className="flex flex-wrap gap-1.5">
        {mentor.qualifications.map((qualification) => (
          <span key={qualification.id} className="inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[11px]">
            {mentorSpecializationLabel(qualification.specializationId)}
            {!self && mentor.status !== 'revoked' ? (
              <button type="button" className="text-rose-600 hover:underline" disabled={busy} aria-label={`Revoke ${mentorSpecializationLabel(qualification.specializationId)}`} onClick={() => void run({ action: 'revoke_qualification', qualificationId: qualification.id }, 'Reason for revoking this qualification')}>×</button>
            ) : null}
          </span>
        ))}
      </div>
      {self ? (
        <p className="text-xs text-muted-foreground">Your own mentor profile must be managed by another administrator.</p>
      ) : mentor.status !== 'revoked' ? (
        <div className="flex flex-wrap items-center gap-1.5">
          {mentor.status === 'suspended'
            ? <Button size="sm" variant="outline" disabled={busy} onClick={() => void run({ action: 'reinstate' }, 'Reason for reinstating')}>Reinstate</Button>
            : <Button size="sm" variant="outline" disabled={busy} onClick={() => void run({ action: 'suspend' }, 'Reason for suspending')}>Suspend</Button>}
          <Button size="sm" variant="destructive" disabled={busy} onClick={() => void run({ action: 'revoke' }, 'Reason for revoking mentor status (they must reapply)')}>Revoke</Button>
          <select
            aria-label="Change tier"
            className="h-8 rounded-md border bg-background px-2 text-xs"
            value=""
            disabled={busy}
            onChange={(event) => event.target.value && void run({ action: 'set_tier', tier: event.target.value }, `Justification for changing tier to ${MENTOR_TIER_LABELS[event.target.value as MentorTier]}`)}
          >
            <option value="">Change tier…</option>
            {MENTOR_TIERS.filter((item) => item !== mentor.tier).map((item) => <option key={item} value={item}>{MENTOR_TIER_LABELS[item]}</option>)}
          </select>
          {missing.length ? (
            <select
              aria-label="Grant qualification"
              className="h-8 rounded-md border bg-background px-2 text-xs"
              value=""
              disabled={busy}
              onChange={(event) => event.target.value && void run({ action: 'grant_qualification', specializationId: event.target.value }, mentor.track === 'academy' ? 'Reason (Academy evidence will be re-checked)' : 'Reason / evidence reviewed')}
            >
              <option value="">Grant qualification…</option>
              {missing.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}
            </select>
          ) : null}
        </div>
      ) : null}
    </li>
  );
}

export default function AdminMentors({ currentAdminId }: { currentAdminId: string | null }) {
  const [view, setView] = React.useState<'applications' | 'mentors'>('applications');
  const [status, setStatus] = React.useState<StatusFilter>('open');
  const [selected, setSelected] = React.useState<string | null>(null);
  const applications = useAdminResource<ApplicationList>(view === 'applications' ? `/api/admin/mentor-applications?status=${status}` : null);
  const mentors = useAdminResource<{ mentors: AdminMentor[] }>(view === 'mentors' ? '/api/admin/mentors' : null);
  const counts = applications.data?.counts ?? {};
  const openCount = (counts.submitted ?? 0) + (counts.under_review ?? 0) + (counts.changes_requested ?? 0);

  return (
    <div className="space-y-4">
      <Segmented
        label="Mentor administration"
        value={view}
        onChange={(value) => { setView(value); setSelected(null); }}
        options={[{ value: 'applications', label: 'Applications', count: applications.data ? openCount : undefined }, { value: 'mentors', label: 'Approved mentors' }]}
      />

      {view === 'applications' ? (
        <div className="grid gap-4 lg:grid-cols-[minmax(0,380px)_1fr]">
          <Panel>
            <PanelHeader
              title="Review queue"
              description="Approval requires evidence and a human decision. XP never qualifies anyone."
              actions={<RefreshButton loading={applications.loading} onClick={() => void applications.reload()} />}
            />
            <div className="border-b px-4 py-2">
              <Segmented
                label="Status filter"
                value={status}
                onChange={(value) => { setStatus(value); setSelected(null); }}
                options={[
                  { value: 'open', label: 'Open' },
                  { value: 'approved', label: 'Approved', count: counts.approved },
                  { value: 'rejected', label: 'Rejected', count: counts.rejected },
                  { value: 'withdrawn', label: 'Withdrawn', count: counts.withdrawn },
                  { value: 'all', label: 'All' },
                ]}
              />
            </div>
            {applications.loading && !applications.data ? <LoadingRows /> : applications.error ? <ErrorState message={applications.error} onRetry={() => void applications.reload()} /> : !applications.data?.applications.length ? (
              <EmptyState icon={Inbox} title="No applications here" description="New mentor applications appear in this queue." />
            ) : (
              <ul className="divide-y">
                {applications.data.applications.map((item) => (
                  <li key={item.id}>
                    <button
                      type="button"
                      onClick={() => setSelected(item.id)}
                      aria-current={selected === item.id ? 'true' : undefined}
                      className={`flex w-full items-center gap-3 px-4 py-3 text-left transition hover:bg-muted/50 ${selected === item.id ? 'bg-primary/[0.06]' : ''}`}
                    >
                      <Avatar name={item.applicant.displayName || item.applicant.email} src={item.applicant.avatarUrl} />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium">{item.applicant.displayName || item.applicant.email}</span>
                        <span className="block truncate text-xs text-muted-foreground">{item.specializations.map(mentorSpecializationLabel).join(', ')}</span>
                      </span>
                      <span className="flex flex-col items-end gap-1">
                        <Pill tone={APPLICATION_TONE[item.status]}>{label(item.status)}</Pill>
                        <span className="text-[10px] text-muted-foreground">{timeAgo(item.submittedAt)}</span>
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </Panel>
          <Panel className="min-h-[300px]">
            <PanelHeader title="Application" description={selected ? undefined : 'Select an application to review.'} />
            {selected ? (
              <ApplicationReview key={selected} id={selected} currentAdminId={currentAdminId} onChanged={() => void applications.reload()} />
            ) : (
              <EmptyState icon={ClipboardCheck} title="Nothing selected" />
            )}
          </Panel>
        </div>
      ) : (
        <Panel>
          <PanelHeader
            title="Approved mentors"
            description="Suspend, reinstate, revoke, change tier or manage qualifications. Every action requires a reason and is audited."
            actions={<RefreshButton loading={mentors.loading} onClick={() => void mentors.reload()} />}
          />
          {mentors.loading && !mentors.data ? <LoadingRows /> : mentors.error ? <ErrorState message={mentors.error} onRetry={() => void mentors.reload()} /> : !mentors.data?.mentors.length ? (
            <EmptyState icon={BadgeCheck} title="No mentors yet" description="Approved applicants appear here." />
          ) : (
            <ul className="divide-y">
              {mentors.data.mentors.map((mentor) => <MentorRow key={mentor.mentorId} mentor={mentor} currentAdminId={currentAdminId} onChanged={() => void mentors.reload()} />)}
            </ul>
          )}
        </Panel>
      )}
    </div>
  );
}
