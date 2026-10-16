'use client';

import * as React from 'react';
import { Loader2, Plus, Send, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { MENTOR_CODE_OF_CONDUCT, type MentorEligibility, type MentorTrack } from '@/lib/mentorship/policy';
import { MENTOR_SPECIALIZATIONS } from '@/lib/mentorship/specializations';
import type { MentorApplicationSummary } from '@/lib/mentorship/types';
import { mentorshipMutate } from './mentorship-client';

type CredentialDraft = { name: string; issuer: string; year: string; url: string };

type Draft = {
  track: MentorTrack;
  headline: string;
  bio: string;
  specializations: string[];
  yearsExperience: string;
  teachingBackground: string;
  motivation: string;
  credentials: CredentialDraft[];
  profileUrl: string;
  timezone: string;
  acceptCodeOfConduct: boolean;
};

function browserTimeZone() {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  } catch {
    return 'UTC';
  }
}

function draftFrom(existing: MentorApplicationSummary | null, defaultTrack: MentorTrack): Draft {
  return {
    track: existing?.track ?? defaultTrack,
    headline: existing?.headline ?? '',
    bio: existing?.bio ?? '',
    specializations: existing?.specializations ?? [],
    yearsExperience: String(existing?.yearsExperience ?? 0),
    teachingBackground: existing?.teachingBackground ?? '',
    motivation: existing?.motivation ?? '',
    credentials: (existing?.credentials ?? []).map((item) => ({ name: item.name, issuer: item.issuer, year: item.year ? String(item.year) : '', url: item.url ?? '' })),
    profileUrl: existing?.profileUrl ?? '',
    timezone: existing?.timezone ?? browserTimeZone(),
    acceptCodeOfConduct: false,
  };
}

const fieldLabel = 'flex flex-col gap-1.5 text-xs font-medium';

export default function MentorApplicationForm({
  eligibility,
  existing,
  onDone,
}: {
  eligibility: MentorEligibility;
  /** When set, the form resubmits an application that has requested changes. */
  existing: MentorApplicationSummary | null;
  onDone: () => void;
}) {
  const [draft, setDraft] = React.useState<Draft>(() => draftFrom(existing, eligibility.advancedPractitioner ? 'academy' : 'external'));
  const [busy, setBusy] = React.useState(false);
  const set = <K extends keyof Draft>(key: K, value: Draft[K]) => setDraft((current) => ({ ...current, [key]: value }));

  const eligibleIds = new Set(eligibility.specializations.filter((item) => item.eligible).map((item) => item.specializationId));
  const selectable = (id: string) => draft.track === 'external' || eligibleIds.has(id);

  function toggleSpecialization(id: string) {
    set('specializations', draft.specializations.includes(id) ? draft.specializations.filter((item) => item !== id) : [...draft.specializations, id]);
  }

  function changeTrack(track: MentorTrack) {
    if (existing) return;
    setDraft((current) => ({
      ...current,
      track,
      specializations: track === 'academy' ? current.specializations.filter((id) => eligibleIds.has(id)) : current.specializations,
    }));
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    try {
      const application = {
        track: draft.track,
        headline: draft.headline,
        bio: draft.bio,
        specializations: draft.specializations,
        yearsExperience: Number.parseInt(draft.yearsExperience, 10) || 0,
        teachingBackground: draft.teachingBackground,
        motivation: draft.motivation,
        credentials: draft.credentials
          .filter((item) => item.name.trim() || item.issuer.trim())
          .map((item) => ({
            name: item.name,
            issuer: item.issuer,
            ...(item.year ? { year: Number.parseInt(item.year, 10) } : {}),
            ...(item.url.trim() ? { url: item.url.trim() } : {}),
          })),
        ...(draft.profileUrl.trim() ? { profileUrl: draft.profileUrl.trim() } : {}),
        timezone: draft.timezone,
        acceptCodeOfConduct: draft.acceptCodeOfConduct,
      };
      await mentorshipMutate(
        '/api/mentors/me/application',
        'POST',
        existing ? { action: 'resubmit', applicationId: existing.id, application } : { action: 'submit', application }
      );
      toast.success(existing ? 'Application resubmitted for review' : 'Application submitted for review');
      onDone();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not submit the application');
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-5" aria-label="Mentor application">
      <fieldset className="space-y-2">
        <legend className="text-sm font-medium">How are you applying?</legend>
        <div className="grid gap-2 sm:grid-cols-2">
          {([
            { value: 'academy', title: 'Academy-grown mentor', body: 'Qualify through verified OXSIG capability evidence.', disabled: !eligibility.advancedPractitioner },
            { value: 'external', title: 'Industry professional', body: 'Qualify through professional experience and credentials reviewed by OXSIG.', disabled: false },
          ] as const).map((option) => (
            <label
              key={option.value}
              className={`flex cursor-pointer gap-3 rounded-lg border p-3 text-sm ${draft.track === option.value ? 'border-primary bg-primary/[0.04]' : ''} ${option.disabled || (existing && existing.track !== option.value) ? 'cursor-not-allowed opacity-50' : ''}`}
            >
              <input
                type="radio"
                name="track"
                className="mt-1"
                checked={draft.track === option.value}
                disabled={option.disabled || Boolean(existing && existing.track !== option.value)}
                onChange={() => changeTrack(option.value)}
              />
              <span>
                <span className="block font-medium">{option.title}</span>
                <span className="block text-xs text-muted-foreground">{option.disabled ? 'Demonstrate enough verified capabilities in a specialization first.' : option.body}</span>
              </span>
            </label>
          ))}
        </div>
      </fieldset>

      <fieldset className="space-y-2">
        <legend className="text-sm font-medium">Specializations you want to mentor</legend>
        <div className="grid gap-2 sm:grid-cols-2">
          {MENTOR_SPECIALIZATIONS.map((item) => {
            const allowed = selectable(item.id);
            return (
              <label key={item.id} className={`flex gap-2 rounded-lg border p-2.5 text-sm ${allowed ? 'cursor-pointer' : 'cursor-not-allowed opacity-50'}`}>
                <input type="checkbox" className="mt-1" checked={draft.specializations.includes(item.id)} disabled={!allowed} onChange={() => toggleSpecialization(item.id)} />
                <span>
                  <span className="block font-medium">{item.label}</span>
                  <span className="block text-[11px] text-muted-foreground">
                    {draft.track === 'academy' && !allowed
                      ? item.academyEvidence ? 'Not enough verified evidence yet.' : 'No Academy evidence pathway yet — professionals only.'
                      : item.description}
                  </span>
                </span>
              </label>
            );
          })}
        </div>
      </fieldset>

      <div className="grid gap-4 sm:grid-cols-2">
        <label className={`${fieldLabel} sm:col-span-2`}>
          Headline
          <Input value={draft.headline} onChange={(event) => set('headline', event.target.value)} maxLength={120} required placeholder="e.g. Linux engineer who loves debugging processes" />
        </label>
        <label className={`${fieldLabel} sm:col-span-2`}>
          About you <span className="font-normal text-muted-foreground">(80–4000 characters, shown on your profile)</span>
          <Textarea value={draft.bio} onChange={(event) => set('bio', event.target.value)} rows={5} maxLength={4000} required />
        </label>
        <label className={fieldLabel}>
          Years of hands-on experience
          <Input type="number" min={0} max={60} value={draft.yearsExperience} onChange={(event) => set('yearsExperience', event.target.value)} />
        </label>
        <label className={fieldLabel}>
          Time zone (IANA)
          <Input value={draft.timezone} onChange={(event) => set('timezone', event.target.value)} required placeholder="Europe/London" />
        </label>
        <label className={`${fieldLabel} sm:col-span-2`}>
          Teaching or mentoring background <span className="font-normal text-muted-foreground">(optional)</span>
          <Textarea value={draft.teachingBackground} onChange={(event) => set('teachingBackground', event.target.value)} rows={3} maxLength={2000} />
        </label>
        <label className={`${fieldLabel} sm:col-span-2`}>
          Why do you want to mentor? <span className="font-normal text-muted-foreground">(seen by reviewers only)</span>
          <Textarea value={draft.motivation} onChange={(event) => set('motivation', event.target.value)} rows={3} maxLength={2000} required />
        </label>
        <label className={`${fieldLabel} sm:col-span-2`}>
          Professional profile link <span className="font-normal text-muted-foreground">(optional, https)</span>
          <Input type="url" value={draft.profileUrl} onChange={(event) => set('profileUrl', event.target.value)} placeholder="https://" />
        </label>
      </div>

      <fieldset className="space-y-2">
        <legend className="text-sm font-medium">Credentials <span className="font-normal text-muted-foreground">(self-reported; only reviewer-verified items appear publicly)</span></legend>
        {draft.credentials.map((credential, index) => (
          <div key={index} className="grid gap-2 rounded-lg border p-2 sm:grid-cols-[1fr_1fr_90px_1fr_auto]">
            <Input aria-label="Credential name" placeholder="Credential" value={credential.name} onChange={(event) => set('credentials', draft.credentials.map((item, i) => (i === index ? { ...item, name: event.target.value } : item)))} />
            <Input aria-label="Issuer" placeholder="Issuer" value={credential.issuer} onChange={(event) => set('credentials', draft.credentials.map((item, i) => (i === index ? { ...item, issuer: event.target.value } : item)))} />
            <Input aria-label="Year" placeholder="Year" inputMode="numeric" value={credential.year} onChange={(event) => set('credentials', draft.credentials.map((item, i) => (i === index ? { ...item, year: event.target.value } : item)))} />
            <Input aria-label="Verification link" placeholder="https:// (optional)" value={credential.url} onChange={(event) => set('credentials', draft.credentials.map((item, i) => (i === index ? { ...item, url: event.target.value } : item)))} />
            <Button type="button" variant="ghost" size="icon" aria-label="Remove credential" onClick={() => set('credentials', draft.credentials.filter((_, i) => i !== index))}><Trash2 className="h-4 w-4" /></Button>
          </div>
        ))}
        {draft.credentials.length < 10 ? (
          <Button type="button" variant="outline" size="sm" onClick={() => set('credentials', [...draft.credentials, { name: '', issuer: '', year: '', url: '' }])}>
            <Plus className="mr-1.5 h-4 w-4" aria-hidden="true" /> Add credential
          </Button>
        ) : null}
      </fieldset>

      <div className="space-y-2 rounded-lg border bg-muted/20 p-3">
        <p className="text-sm font-medium">Mentor code of conduct</p>
        <ul className="list-disc space-y-1 pl-5 text-xs text-muted-foreground">
          {MENTOR_CODE_OF_CONDUCT.map((rule) => <li key={rule}>{rule}</li>)}
        </ul>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={draft.acceptCodeOfConduct} onChange={(event) => set('acceptCodeOfConduct', event.target.checked)} required />
          I agree to follow the mentor code of conduct.
        </label>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" disabled={busy || !draft.acceptCodeOfConduct || draft.specializations.length === 0}>
          {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" /> : <Send className="mr-2 h-4 w-4" aria-hidden="true" />}
          {existing ? 'Resubmit application' : 'Submit application'}
        </Button>
        <p className="text-xs text-muted-foreground">An OXSIG administrator reviews every application. XP and subscriptions never qualify anyone.</p>
      </div>
    </form>
  );
}
