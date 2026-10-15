'use client';

import * as React from 'react';
import Link from 'next/link';
import { ArrowRight, Loader2, Search, Users } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { MENTOR_SPECIALIZATIONS } from '@/lib/mentorship/specializations';
import type { PublicMentorProfile } from '@/lib/mentorship/types';
import MentorCard from './MentorCard';
import { mentorshipGet } from './mentorship-client';

type TrackFilter = 'all' | 'academy' | 'external';

export default function MentorDirectory() {
  const [specialization, setSpecialization] = React.useState('');
  const [track, setTrack] = React.useState<TrackFilter>('all');
  const [mentors, setMentors] = React.useState<PublicMentorProfile[] | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    let active = true;
    const params = new URLSearchParams();
    if (specialization) params.set('specialization', specialization);
    if (track !== 'all') params.set('track', track);
    setMentors(null);
    setError(null);
    const query = params.toString();
    mentorshipGet<{ mentors: PublicMentorProfile[] }>(`/api/mentors${query ? `?${query}` : ''}`)
      .then((body) => active && setMentors(body.mentors))
      .catch((cause) => active && setError(cause instanceof Error ? cause.message : 'Could not load mentors'));
    return () => {
      active = false;
    };
  }, [specialization, track]);

  return (
    <div className="mx-auto max-w-6xl space-y-5 py-4">
      <section className="rounded-2xl border bg-gradient-to-r from-primary/10 via-background to-cyan-500/10 p-5 sm:p-7">
        <Badge variant="secondary" className="mb-3 gap-1.5"><Users className="h-3.5 w-3.5" aria-hidden="true" /> Find a mentor</Badge>
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">Learn from people who have proved it.</h1>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">
          Every mentor here passed administrator review. Academy-grown mentors earned their qualifications through verified capability evidence; industry professionals were reviewed on their experience and credentials.
        </p>
        <p className="mt-3 rounded-lg border border-amber-500/30 bg-amber-500/[0.06] px-3 py-2 text-xs text-muted-foreground">
          Session booking and in-mission help requests are not available yet. They arrive with free mentorship in the next release.
        </p>
      </section>

      <div className="flex flex-col gap-3 rounded-xl border bg-card p-3 sm:flex-row sm:items-end">
        <label className="flex min-w-0 flex-1 flex-col gap-1 text-xs font-medium">
          Specialization
          <select
            value={specialization}
            onChange={(event) => setSpecialization(event.target.value)}
            className="h-9 rounded-md border bg-background px-2 text-sm"
          >
            <option value="">All specializations</option>
            {MENTOR_SPECIALIZATIONS.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}
          </select>
        </label>
        <fieldset className="flex flex-col gap-1 text-xs font-medium">
          <legend className="mb-1">Mentor type</legend>
          <div className="flex gap-1 rounded-md border p-0.5" role="radiogroup">
            {(['all', 'academy', 'external'] as const).map((value) => (
              <button
                key={value}
                type="button"
                role="radio"
                aria-checked={track === value}
                onClick={() => setTrack(value)}
                className={`rounded px-3 py-1.5 text-xs ${track === value ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted'}`}
              >
                {value === 'all' ? 'All' : value === 'academy' ? 'Academy-grown' : 'Professionals'}
              </button>
            ))}
          </div>
        </fieldset>
      </div>

      {error ? (
        <p role="alert" className="rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm">{error}</p>
      ) : mentors === null ? (
        <div className="flex min-h-[30vh] items-center justify-center text-sm text-muted-foreground"><Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" /> Loading mentors…</div>
      ) : mentors.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed p-10 text-center">
          <Search className="h-6 w-6 text-muted-foreground" aria-hidden="true" />
          <p className="font-medium">No approved mentors match yet.</p>
          <p className="max-w-md text-sm text-muted-foreground">The mentor network is just opening. Experienced? Apply to mentor others.</p>
          <Button asChild variant="outline"><Link href="/academy/mentor-center">Open Mentor center <ArrowRight className="ml-2 h-4 w-4" aria-hidden="true" /></Link></Button>
        </div>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {mentors.map((mentor) => <li key={mentor.mentorId}><MentorCard mentor={mentor} /></li>)}
        </ul>
      )}
    </div>
  );
}
