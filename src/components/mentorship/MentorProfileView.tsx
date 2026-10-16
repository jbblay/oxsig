'use client';

import * as React from 'react';
import Link from 'next/link';
import { ArrowLeft, BadgeCheck, CalendarClock, Clock, Loader2, ShieldCheck } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { MENTOR_TIER_LABELS } from '@/lib/mentorship/policy';
import { mentorSpecializationLabel } from '@/lib/mentorship/specializations';
import type { PublicMentorProfile } from '@/lib/mentorship/types';
import { MentorAvatar, MentorTrackBadge } from './MentorCard';
import { mentorshipGet } from './mentorship-client';

export default function MentorProfileView({ mentorId }: { mentorId: string }) {
  const [mentor, setMentor] = React.useState<PublicMentorProfile | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    let active = true;
    mentorshipGet<{ mentor: PublicMentorProfile }>(`/api/mentors/${encodeURIComponent(mentorId)}`)
      .then((body) => active && setMentor(body.mentor))
      .catch((cause) => active && setError(cause instanceof Error ? cause.message : 'Could not load mentor'));
    return () => {
      active = false;
    };
  }, [mentorId]);

  const back = (
    <Button variant="ghost" size="sm" asChild><Link href="/academy/mentors"><ArrowLeft className="mr-1.5 h-4 w-4" aria-hidden="true" /> All mentors</Link></Button>
  );

  if (error) return <div className="mx-auto max-w-4xl space-y-3 py-4">{back}<p role="alert" className="rounded-lg border p-6 text-sm">{error}</p></div>;
  if (!mentor) return <div className="flex min-h-[40vh] items-center justify-center text-sm text-muted-foreground"><Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" /> Loading mentor…</div>;

  return (
    <div className="mx-auto max-w-4xl space-y-4 py-4">
      {back}
      <section className="flex flex-col gap-4 rounded-2xl border bg-card p-5 sm:flex-row sm:items-start sm:p-6">
        <MentorAvatar name={mentor.displayName} src={mentor.avatarUrl} size={72} />
        <div className="min-w-0 flex-1 space-y-2">
          <h1 className="text-2xl font-semibold tracking-tight">{mentor.displayName}</h1>
          <p className="text-sm text-muted-foreground">{mentor.headline}</p>
          <div className="flex flex-wrap gap-1.5">
            <Badge className="gap-1"><BadgeCheck className="h-3 w-3" aria-hidden="true" /> {MENTOR_TIER_LABELS[mentor.tier]}</Badge>
            <MentorTrackBadge track={mentor.track} />
            <Badge variant="outline" className="gap-1"><Clock className="h-3 w-3" aria-hidden="true" /> {mentor.timezone}</Badge>
          </div>
        </div>
      </section>

      <div className="grid gap-4 md:grid-cols-[1fr_300px]">
        <Card>
          <CardHeader><CardTitle className="text-base">About</CardTitle></CardHeader>
          <CardContent className="space-y-4 text-sm leading-6">
            <p className="whitespace-pre-line">{mentor.bio}</p>
            {mentor.availabilityNote ? (
              <div className="rounded-lg bg-muted/40 p-3 text-xs"><span className="font-medium">Availability: </span>{mentor.availabilityNote}</div>
            ) : null}
          </CardContent>
        </Card>

        <div className="space-y-4">
          <Card>
            <CardHeader><CardTitle className="text-base">Approved to mentor</CardTitle></CardHeader>
            <CardContent>
              <ul className="space-y-2">
                {mentor.qualifications.map((item) => (
                  <li key={item.id} className="rounded-lg border p-2.5">
                    <p className="text-sm font-medium">{mentorSpecializationLabel(item.specializationId)}</p>
                    <p className="text-[11px] text-muted-foreground">
                      {item.basis === 'academy_evidence' ? 'Verified Academy capability evidence' : 'Professional review'} · since {new Date(item.grantedAt).toLocaleDateString()}
                    </p>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>

          {mentor.verifiedCredentials.length ? (
            <Card>
              <CardHeader><CardTitle className="text-base">Verified credentials</CardTitle></CardHeader>
              <CardContent>
                <ul className="space-y-2 text-sm">
                  {mentor.verifiedCredentials.map((credential, index) => (
                    <li key={`${credential.name}-${index}`} className="flex gap-2">
                      <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-emerald-500" aria-hidden="true" />
                      <span>{credential.name} <span className="text-muted-foreground">· {credential.issuer}{credential.year ? ` · ${credential.year}` : ''}</span></span>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          ) : null}

          <Card>
            <CardContent className="space-y-2 pt-6 text-xs text-muted-foreground">
              <p className="flex items-center gap-1.5 font-medium text-foreground"><CalendarClock className="h-4 w-4" aria-hidden="true" /> Sessions</p>
              <p>Booking is not open yet. Reviews appear only after real, completed sessions.</p>
              <Button disabled className="w-full" aria-disabled="true">Booking coming soon</Button>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
