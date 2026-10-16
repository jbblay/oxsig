'use client';

import * as React from 'react';
import Link from 'next/link';
import { CalendarClock, Loader2, Plus, Save, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { SESSION_KIND_DEFAULT_MINUTES, SESSION_KIND_LABELS, type AvailabilityRule, type SessionKind } from '@/lib/mentorship/scheduling';
import { mentorSpecializationLabel } from '@/lib/mentorship/specializations';
import type { MentorOfferingView, MentorScheduleState } from '@/lib/mentorship/types';
import { mentorshipGet, mentorshipMutate } from './mentorship-client';
import { WEEKDAY_LABELS, minuteToTime, timeToMinute } from './time';

const KINDS = Object.keys(SESSION_KIND_LABELS) as SessionKind[];
const DURATIONS = [15, 30, 45, 60] as const;

type OfferingDraft = { id: string | null; kind: SessionKind; title: string; description: string; durationMinutes: 15 | 30 | 45 | 60; specializationIds: string[] };

function emptyDraft(qualified: string[]): OfferingDraft {
  return { id: null, kind: 'quick_help', title: SESSION_KIND_LABELS.quick_help, description: '', durationMinutes: 15, specializationIds: qualified.slice(0, 1) };
}

function OfferingEditor({ draft, qualified, onCancel, onSaved }: { draft: OfferingDraft; qualified: string[]; onCancel: () => void; onSaved: () => void }) {
  const [value, setValue] = React.useState(draft);
  const [busy, setBusy] = React.useState(false);

  async function save() {
    setBusy(true);
    try {
      await mentorshipMutate('/api/mentors/me/schedule', 'POST', {
        action: 'save_offering',
        ...(value.id ? { offeringId: value.id } : {}),
        offering: { kind: value.kind, title: value.title, description: value.description, durationMinutes: value.durationMinutes, specializationIds: value.specializationIds },
      });
      toast.success('Session type saved');
      onSaved();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not save');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-3 rounded-lg border bg-muted/20 p-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="flex flex-col gap-1 text-xs font-medium">
          Type
          <select
            className="h-9 rounded-md border bg-background px-2 text-sm"
            value={value.kind}
            onChange={(event) => {
              const kind = event.target.value as SessionKind;
              setValue((current) => ({ ...current, kind, durationMinutes: SESSION_KIND_DEFAULT_MINUTES[kind], title: current.id ? current.title : SESSION_KIND_LABELS[kind] }));
            }}
          >
            {KINDS.map((kind) => <option key={kind} value={kind}>{SESSION_KIND_LABELS[kind]}</option>)}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-xs font-medium">
          Length
          <select className="h-9 rounded-md border bg-background px-2 text-sm" value={value.durationMinutes} onChange={(event) => setValue((current) => ({ ...current, durationMinutes: Number(event.target.value) as OfferingDraft['durationMinutes'] }))}>
            {DURATIONS.map((minutes) => <option key={minutes} value={minutes}>{minutes} minutes</option>)}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-xs font-medium sm:col-span-2">Title<Input value={value.title} maxLength={80} onChange={(event) => setValue((current) => ({ ...current, title: event.target.value }))} /></label>
        <label className="flex flex-col gap-1 text-xs font-medium sm:col-span-2">Description<Input value={value.description} maxLength={500} placeholder="What learners should bring" onChange={(event) => setValue((current) => ({ ...current, description: event.target.value }))} /></label>
      </div>
      <fieldset className="text-xs">
        <legend className="mb-1 font-medium">Specializations (only those you are approved for)</legend>
        <div className="flex flex-wrap gap-3">
          {qualified.map((id) => (
            <label key={id} className="flex items-center gap-1.5">
              <input type="checkbox" checked={value.specializationIds.includes(id)} onChange={() => setValue((current) => ({ ...current, specializationIds: current.specializationIds.includes(id) ? current.specializationIds.filter((item) => item !== id) : [...current.specializationIds, id] }))} />
              {mentorSpecializationLabel(id)}
            </label>
          ))}
        </div>
      </fieldset>
      <p className="text-[11px] text-muted-foreground">Price: Free. Paid sessions are not available during the pilot.</p>
      <div className="flex gap-2">
        <Button size="sm" onClick={() => void save()} disabled={busy || !value.specializationIds.length || value.title.trim().length < 3}>{busy ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <Save className="mr-1.5 h-3.5 w-3.5" />} Save</Button>
        <Button size="sm" variant="ghost" onClick={onCancel}>Cancel</Button>
      </div>
    </div>
  );
}

function AvailabilityEditor({ initial, timezone, onSaved }: { initial: AvailabilityRule[]; timezone: string; onSaved: () => void }) {
  const [rules, setRules] = React.useState(initial);
  const [busy, setBusy] = React.useState(false);
  const update = (index: number, patch: Partial<AvailabilityRule>) => setRules((current) => current.map((rule, i) => (i === index ? { ...rule, ...patch } : rule)));

  async function save() {
    setBusy(true);
    try {
      await mentorshipMutate('/api/mentors/me/schedule', 'POST', { action: 'set_availability', availability: { rules } });
      toast.success('Availability saved');
      onSaved();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not save availability');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-2">
      <p className="text-xs text-muted-foreground">Weekly windows in your profile time zone (<span className="font-medium text-foreground">{timezone}</span>). Learners see open slots in their own time zone.</p>
      {rules.length === 0 ? <p className="rounded-md border border-dashed p-3 text-center text-xs text-muted-foreground">No availability yet — learners cannot book you.</p> : null}
      {rules.map((rule, index) => (
        <div key={index} className="grid grid-cols-[1fr_auto_auto_auto] items-center gap-2">
          <select aria-label="Day" className="h-9 rounded-md border bg-background px-2 text-sm" value={rule.weekday} onChange={(event) => update(index, { weekday: Number(event.target.value) })}>
            {WEEKDAY_LABELS.map((label, day) => <option key={label} value={day}>{label}</option>)}
          </select>
          <Input aria-label="Start" type="time" step={900} className="w-28" value={minuteToTime(rule.startMinute)} onChange={(event) => update(index, { startMinute: timeToMinute(event.target.value) })} />
          <Input aria-label="End" type="time" step={900} className="w-28" value={rule.endMinute === 1440 ? '23:59' : minuteToTime(rule.endMinute)} onChange={(event) => update(index, { endMinute: event.target.value === '23:59' ? 1440 : timeToMinute(event.target.value) })} />
          <Button variant="ghost" size="icon" aria-label="Remove window" onClick={() => setRules((current) => current.filter((_, i) => i !== index))}><Trash2 className="h-4 w-4" /></Button>
        </div>
      ))}
      <div className="flex flex-wrap gap-2">
        <Button size="sm" variant="outline" onClick={() => setRules((current) => [...current, { weekday: 1, startMinute: 18 * 60, endMinute: 20 * 60 }])} disabled={rules.length >= 21}><Plus className="mr-1.5 h-3.5 w-3.5" /> Add window</Button>
        <Button size="sm" onClick={() => void save()} disabled={busy}>{busy ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <Save className="mr-1.5 h-3.5 w-3.5" />} Save availability</Button>
      </div>
    </div>
  );
}

export default function MentorScheduleManager() {
  const [state, setState] = React.useState<MentorScheduleState | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [editing, setEditing] = React.useState<OfferingDraft | null>(null);
  const [version, setVersion] = React.useState(0);

  const load = React.useCallback(async () => {
    try {
      setState(await mentorshipGet<MentorScheduleState>('/api/mentors/me/schedule'));
      setError(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not load your schedule');
    }
  }, []);
  React.useEffect(() => { void load(); }, [load, version]);

  async function toggle(offering: MentorOfferingView) {
    try {
      await mentorshipMutate('/api/mentors/me/schedule', 'POST', { action: 'set_offering_active', offeringId: offering.id, isActive: !offering.isActive });
      setVersion((value) => value + 1);
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : 'Could not update');
    }
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <CardTitle className="flex items-center gap-2 text-base"><CalendarClock className="h-4 w-4" aria-hidden="true" /> Sessions you offer</CardTitle>
          <Button variant="outline" size="sm" asChild><Link href="/academy/sessions">My sessions</Link></Button>
        </div>
        <CardDescription>Free pilot sessions. Learners can book only specializations you are approved for.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        {error ? <p role="alert" className="text-sm text-destructive">{error}</p> : !state ? (
          <p className="flex items-center text-sm text-muted-foreground"><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Loading…</p>
        ) : (
          <>
            <section className="space-y-2">
              {state.offerings.length === 0 && !editing ? <p className="text-xs text-muted-foreground">No session types yet.</p> : null}
              <ul className="space-y-2">
                {state.offerings.map((offering) => (
                  <li key={offering.id} className={`flex flex-wrap items-center gap-2 rounded-lg border p-2.5 ${offering.isActive ? '' : 'opacity-60'}`}>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium">{offering.title} <span className="font-normal text-muted-foreground">· {offering.durationMinutes} min · Free</span></p>
                      <p className="text-[11px] text-muted-foreground">{offering.specializationIds.map(mentorSpecializationLabel).join(', ')}</p>
                    </div>
                    {!offering.isActive ? <Badge variant="outline">Hidden</Badge> : null}
                    <Button size="sm" variant="ghost" onClick={() => setEditing({ id: offering.id, kind: offering.kind, title: offering.title, description: offering.description, durationMinutes: offering.durationMinutes as OfferingDraft['durationMinutes'], specializationIds: offering.specializationIds })}>Edit</Button>
                    <Button size="sm" variant="ghost" onClick={() => void toggle(offering)}>{offering.isActive ? 'Hide' : 'Show'}</Button>
                  </li>
                ))}
              </ul>
              {editing ? (
                <OfferingEditor key={editing.id ?? 'new'} draft={editing} qualified={state.qualifiedSpecializationIds} onCancel={() => setEditing(null)} onSaved={() => { setEditing(null); setVersion((value) => value + 1); }} />
              ) : (
                <Button size="sm" variant="outline" onClick={() => setEditing(emptyDraft(state.qualifiedSpecializationIds))} disabled={!state.qualifiedSpecializationIds.length}><Plus className="mr-1.5 h-3.5 w-3.5" /> Add session type</Button>
              )}
            </section>
            <section className="space-y-2 border-t pt-4">
              <p className="text-sm font-medium">Weekly availability</p>
              <AvailabilityEditor key={JSON.stringify(state.rules)} initial={state.rules} timezone={state.timezone} onSaved={() => setVersion((value) => value + 1)} />
            </section>
          </>
        )}
      </CardContent>
    </Card>
  );
}
