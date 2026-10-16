'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { CalendarCheck, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { mentorSpecializationLabel } from '@/lib/mentorship/specializations';
import type { MentorAvailabilityView, PublicMentorProfile } from '@/lib/mentorship/types';
import { mentorshipGet, mentorshipMutate } from './mentorship-client';
import { browserTimeZone, dayKey, formatInZone } from './time';

export default function BookingPanel({ mentor, initialTopic, initialShareContext }: { mentor: PublicMentorProfile; initialTopic?: string; initialShareContext?: boolean }) {
  const router = useRouter();
  const timezone = React.useMemo(browserTimeZone, []);
  const [offeringId, setOfferingId] = React.useState(mentor.offerings[0]?.id ?? '');
  const offering = mentor.offerings.find((item) => item.id === offeringId) ?? null;
  const [specializationId, setSpecializationId] = React.useState(offering?.specializationIds[0] ?? '');
  const [availability, setAvailability] = React.useState<MentorAvailabilityView | null>(null);
  const [loadError, setLoadError] = React.useState<string | null>(null);
  const [slot, setSlot] = React.useState<string | null>(null);
  const [topic, setTopic] = React.useState(initialTopic ?? '');
  const [goal, setGoal] = React.useState('');
  const [attempted, setAttempted] = React.useState('');
  const [shareContext, setShareContext] = React.useState(Boolean(initialShareContext));
  const [busy, setBusy] = React.useState(false);

  React.useEffect(() => {
    if (!offeringId) return;
    let active = true;
    setAvailability(null);
    setSlot(null);
    setLoadError(null);
    mentorshipGet<MentorAvailabilityView>(`/api/mentors/${mentor.mentorId}/availability?offeringId=${offeringId}`)
      .then((body) => active && setAvailability(body))
      .catch((cause) => active && setLoadError(cause instanceof Error ? cause.message : 'Could not load availability'));
    return () => { active = false; };
  }, [mentor.mentorId, offeringId]);

  React.useEffect(() => {
    if (offering && !offering.specializationIds.includes(specializationId)) setSpecializationId(offering.specializationIds[0] ?? '');
  }, [offering, specializationId]);

  const days = React.useMemo(() => {
    const grouped = new Map<string, string[]>();
    for (const value of availability?.slots ?? []) {
      const key = dayKey(value, timezone);
      if (!grouped.has(key)) grouped.set(key, []);
      grouped.get(key)!.push(value);
    }
    return [...grouped.entries()];
  }, [availability, timezone]);

  async function book() {
    if (!slot || !offering) return;
    setBusy(true);
    try {
      await mentorshipMutate('/api/mentorship/sessions', 'POST', {
        mentorId: mentor.mentorId,
        offeringId: offering.id,
        specializationId,
        startsAt: slot,
        learnerTimezone: timezone,
        topic,
        learnerGoal: goal,
        attemptedSummary: attempted,
        shareAcademyContext: shareContext,
      });
      toast.success('Request sent. The mentor will confirm or decline.');
      router.push('/academy/sessions');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not book');
      setBusy(false);
    }
  }

  if (!mentor.bookingAvailable) {
    return <p className="text-xs text-muted-foreground">This mentor has not opened bookings yet.</p>;
  }

  return (
    <div className="space-y-4">
      <label className="flex flex-col gap-1 text-xs font-medium">
        Session type
        <select className="h-9 rounded-md border bg-background px-2 text-sm" value={offeringId} onChange={(event) => setOfferingId(event.target.value)}>
          {mentor.offerings.map((item) => <option key={item.id} value={item.id}>{item.title} · {item.durationMinutes} min · Free</option>)}
        </select>
      </label>
      {offering && offering.specializationIds.length > 1 ? (
        <label className="flex flex-col gap-1 text-xs font-medium">
          Topic area
          <select className="h-9 rounded-md border bg-background px-2 text-sm" value={specializationId} onChange={(event) => setSpecializationId(event.target.value)}>
            {offering.specializationIds.map((id) => <option key={id} value={id}>{mentorSpecializationLabel(id)}</option>)}
          </select>
        </label>
      ) : null}

      <div className="space-y-1.5">
        <p className="text-xs font-medium">Choose a time <span className="font-normal text-muted-foreground">(shown in {timezone})</span></p>
        {loadError ? <p role="alert" className="text-xs text-destructive">{loadError}</p> : !availability ? (
          <p className="flex items-center text-xs text-muted-foreground"><Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> Loading open times…</p>
        ) : days.length === 0 ? (
          <p className="text-xs text-muted-foreground">No open times in the next two weeks.</p>
        ) : (
          <div className="max-h-64 space-y-2 overflow-y-auto pr-1">
            {days.map(([day, slots]) => (
              <div key={day}>
                <p className="mb-1 text-[11px] font-medium text-muted-foreground">{formatInZone(slots[0], timezone, { dateStyle: 'full', timeStyle: undefined })}</p>
                <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label={day}>
                  {slots.map((value) => (
                    <button
                      key={value}
                      type="button"
                      role="radio"
                      aria-checked={slot === value}
                      onClick={() => setSlot(value)}
                      className={`rounded-md border px-2 py-1 text-xs ${slot === value ? 'border-primary bg-primary text-primary-foreground' : 'hover:bg-muted'}`}
                    >
                      {formatInZone(value, timezone, { dateStyle: undefined, timeStyle: 'short' })}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
        {availability ? <p className="text-[11px] text-muted-foreground">Mentor time zone: {availability.mentorTimezone}</p> : null}
      </div>

      <label className="flex flex-col gap-1 text-xs font-medium">What do you need help with?<Input value={topic} maxLength={160} onChange={(event) => setTopic(event.target.value)} placeholder="e.g. DNS lookups fail inside my lab" /></label>
      <label className="flex flex-col gap-1 text-xs font-medium">What does success look like?<Textarea rows={3} value={goal} maxLength={2000} onChange={(event) => setGoal(event.target.value)} /></label>
      <label className="flex flex-col gap-1 text-xs font-medium">What have you tried? <span className="font-normal text-muted-foreground">(optional — do not paste passwords or keys)</span><Textarea rows={3} value={attempted} maxLength={2000} onChange={(event) => setAttempted(event.target.value)} /></label>
      <label className="flex items-start gap-2 text-xs">
        <input type="checkbox" className="mt-0.5" checked={shareContext} onChange={(event) => setShareContext(event.target.checked)} />
        <span>Share my current Academy lesson with this mentor (course, lesson and practice instructions only — never terminal output, labs or credentials).</span>
      </label>
      <Button className="w-full" onClick={() => void book()} disabled={busy || !slot || topic.trim().length < 3 || goal.trim().length < 10 || !specializationId}>
        {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <CalendarCheck className="mr-2 h-4 w-4" />} Request free session
      </Button>
      <p className="text-[11px] text-muted-foreground">Mentors guide you; they do not complete your verified work. Machine control is only possible if you approve it in the Rescue Room.</p>
    </div>
  );
}
