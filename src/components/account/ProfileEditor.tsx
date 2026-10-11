'use client';

import * as React from 'react';
import { Check, Globe, Loader2, MapPin, Save } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  EXPERIENCE_LEVELS,
  FOCUS_AREAS,
  type AccountProfile,
  type ExperienceLevel,
  type FocusArea,
} from '@/lib/account/profile-contract';
import { cn } from '@/lib/utils';

export type ProfileDraft = {
  displayName: string;
  headline: string;
  bio: string;
  avatarUrl: string;
  location: string;
  websiteUrl: string;
  experienceLevel: ExperienceLevel | null;
  focusAreas: FocusArea[];
};

export function draftFromProfile(profile: AccountProfile): ProfileDraft {
  return {
    displayName: profile.displayName || '',
    headline: profile.headline || '',
    bio: profile.bio || '',
    avatarUrl: profile.avatarUrl || '',
    location: profile.location || '',
    websiteUrl: profile.websiteUrl || '',
    experienceLevel: profile.experienceLevel ?? null,
    focusAreas: profile.focusAreas ?? [],
  };
}

export function draftsEqual(a: ProfileDraft, b: ProfileDraft) {
  return (
    a.displayName === b.displayName &&
    a.headline === b.headline &&
    a.bio === b.bio &&
    a.avatarUrl === b.avatarUrl &&
    a.location === b.location &&
    a.websiteUrl === b.websiteUrl &&
    a.experienceLevel === b.experienceLevel &&
    a.focusAreas.length === b.focusAreas.length &&
    a.focusAreas.every((area) => b.focusAreas.includes(area))
  );
}

function isHttpsUrl(value: string) {
  if (!value.trim()) return true;
  try {
    return new URL(value.trim()).protocol === 'https:';
  } catch {
    return false;
  }
}

export function draftErrors(draft: ProfileDraft) {
  const errors: Partial<Record<keyof ProfileDraft, string>> = {};
  if (draft.displayName.trim().length < 2) errors.displayName = 'Use at least 2 characters.';
  if (!isHttpsUrl(draft.avatarUrl)) errors.avatarUrl = 'Use an https:// image link.';
  if (!isHttpsUrl(draft.websiteUrl)) errors.websiteUrl = 'Use an https:// link.';
  return errors;
}

function Field({ id, label, hint, error, children }: { id: string; label: string; hint?: React.ReactNode; error?: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="mb-1.5 flex items-baseline justify-between gap-2">
        <label htmlFor={id} className="text-xs font-medium">{label}</label>
        {hint ? <span className="text-[11px] text-muted-foreground">{hint}</span> : null}
      </div>
      {children}
      {error ? <p className="mt-1 text-xs text-rose-600 dark:text-rose-400">{error}</p> : null}
    </div>
  );
}

export default function ProfileEditor({
  draft,
  onChange,
  dirty,
  saving,
  onSave,
  onDiscard,
}: {
  draft: ProfileDraft;
  onChange: (next: ProfileDraft) => void;
  dirty: boolean;
  saving: boolean;
  onSave: () => void;
  onDiscard: () => void;
}) {
  const errors = draftErrors(draft);
  const showNameError = draft.displayName.trim().length > 0 && Boolean(errors.displayName);
  const valid = Object.keys(errors).length === 0;
  const set = <K extends keyof ProfileDraft>(key: K, value: ProfileDraft[K]) => onChange({ ...draft, [key]: value });

  React.useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 's') {
        event.preventDefault();
        if (dirty && valid && !saving) onSave();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [dirty, onSave, saving, valid]);

  return (
    <form
      className="space-y-6"
      onSubmit={(event) => {
        event.preventDefault();
        if (dirty && valid) onSave();
      }}
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <Field id="account-display-name" label="Display name" error={showNameError ? errors.displayName : undefined}>
          <Input id="account-display-name" value={draft.displayName} onChange={(event) => set('displayName', event.target.value.slice(0, 100))} maxLength={100} autoComplete="name" />
        </Field>
        <Field id="account-headline" label="Headline" hint={`${draft.headline.length}/120`}>
          <Input id="account-headline" value={draft.headline} onChange={(event) => set('headline', event.target.value.slice(0, 120))} maxLength={120} placeholder="e.g. Cloud security engineer · AD enthusiast" />
        </Field>
        <Field id="account-location" label="Location">
          <div className="relative">
            <MapPin className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input id="account-location" className="pl-8" value={draft.location} onChange={(event) => set('location', event.target.value.slice(0, 80))} maxLength={80} placeholder="City or timezone" />
          </div>
        </Field>
        <Field id="account-website" label="Website" error={errors.websiteUrl}>
          <div className="relative">
            <Globe className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input id="account-website" type="url" className="pl-8" value={draft.websiteUrl} onChange={(event) => set('websiteUrl', event.target.value.slice(0, 2000))} placeholder="https://" />
          </div>
        </Field>
      </div>

      <Field id="account-avatar-url" label="Avatar" error={errors.avatarUrl} hint={draft.avatarUrl ? <button type="button" className="text-primary hover:underline" onClick={() => set('avatarUrl', '')}>Use initials instead</button> : 'Image link'}>
        <Input id="account-avatar-url" type="url" value={draft.avatarUrl} onChange={(event) => set('avatarUrl', event.target.value.slice(0, 2000))} placeholder="https://…" />
      </Field>

      <fieldset>
        <legend className="mb-1.5 text-xs font-medium">Experience</legend>
        <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
          {EXPERIENCE_LEVELS.map((level) => {
            const active = draft.experienceLevel === level.id;
            return (
              <button
                key={level.id}
                type="button"
                aria-pressed={active}
                onClick={() => set('experienceLevel', active ? null : level.id)}
                className={cn('rounded-xl border px-3 py-2.5 text-left transition', active ? 'border-primary bg-primary/10 ring-1 ring-primary' : 'hover:border-primary/40 hover:bg-muted/40')}
              >
                <span className="flex items-center justify-between text-sm font-medium">{level.label}{active ? <Check className="h-4 w-4 text-primary" /> : null}</span>
                <span className="text-[11px] text-muted-foreground">{level.hint}</span>
              </button>
            );
          })}
        </div>
      </fieldset>

      <fieldset>
        <legend className="mb-1.5 text-xs font-medium">Focus areas</legend>
        <div className="flex flex-wrap gap-1.5">
          {FOCUS_AREAS.map((area) => {
            const active = draft.focusAreas.includes(area.id);
            return (
              <button
                key={area.id}
                type="button"
                aria-pressed={active}
                onClick={() => set('focusAreas', active ? draft.focusAreas.filter((id) => id !== area.id) : [...draft.focusAreas, area.id])}
                className={cn('inline-flex h-8 items-center gap-1 rounded-full border px-3 text-xs font-medium transition', active ? 'border-primary bg-primary text-primary-foreground' : 'hover:border-primary/40')}
              >
                {active ? <Check className="h-3 w-3" /> : null}
                {area.label}
              </button>
            );
          })}
        </div>
      </fieldset>

      <Field id="account-bio" label="Bio" hint={`${draft.bio.length}/500`}>
        <Textarea id="account-bio" rows={4} value={draft.bio} onChange={(event) => set('bio', event.target.value.slice(0, 500))} maxLength={500} placeholder="Your technical focus, specialties or what you are working towards." />
      </Field>

      <div
        className={cn(
          'sticky bottom-3 z-10 flex flex-wrap items-center gap-2 rounded-xl border px-3 py-2.5 transition',
          dirty ? 'border-primary/30 bg-background/95 shadow-lg shadow-black/5 backdrop-blur' : 'bg-muted/30'
        )}
      >
        {dirty ? (
          <span className="inline-flex h-5 items-center rounded-full border border-amber-500/30 bg-amber-500/10 px-2 text-[10px] font-semibold uppercase tracking-wide text-amber-700 dark:text-amber-300">Unsaved</span>
        ) : (
          <span className="text-xs text-muted-foreground">All changes saved</span>
        )}
        <span className="hidden text-[11px] text-muted-foreground sm:inline">{dirty ? 'Ctrl/⌘ + S to save' : null}</span>
        <div className="ml-auto flex gap-2">
          {dirty ? <Button type="button" variant="ghost" size="sm" disabled={saving} onClick={onDiscard}>Discard</Button> : null}
          <Button type="submit" size="sm" disabled={saving || !dirty || !valid}>
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            Save
          </Button>
        </div>
      </div>
    </form>
  );
}
