import Link from 'next/link';
import { BadgeCheck, Clock, GraduationCap, Briefcase } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { MENTOR_TIER_LABELS } from '@/lib/mentorship/policy';
import { mentorSpecializationLabel } from '@/lib/mentorship/specializations';
import type { PublicMentorProfile } from '@/lib/mentorship/types';

export function MentorAvatar({ name, src, size = 44 }: { name: string; src: string | null; size?: number }) {
  const initials = name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]?.toUpperCase()).join('') || 'M';
  return src ? (
    <img src={src} alt="" width={size} height={size} className="shrink-0 rounded-full border object-cover" style={{ width: size, height: size }} />
  ) : (
    <span aria-hidden="true" className="grid shrink-0 place-items-center rounded-full bg-primary/10 font-semibold text-primary" style={{ width: size, height: size, fontSize: size / 2.8 }}>
      {initials}
    </span>
  );
}

export function MentorTrackBadge({ track }: { track: 'academy' | 'external' }) {
  return track === 'academy' ? (
    <Badge variant="secondary" className="gap-1"><GraduationCap className="h-3 w-3" aria-hidden="true" /> Academy-grown</Badge>
  ) : (
    <Badge variant="secondary" className="gap-1"><Briefcase className="h-3 w-3" aria-hidden="true" /> Industry professional</Badge>
  );
}

export default function MentorCard({ mentor }: { mentor: PublicMentorProfile }) {
  return (
    <Link
      href={`/academy/mentors/${mentor.mentorId}`}
      className="group flex h-full flex-col gap-3 rounded-xl border bg-card p-4 transition hover:border-primary/40 hover:shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <div className="flex items-start gap-3">
        <MentorAvatar name={mentor.displayName} src={mentor.avatarUrl} />
        <div className="min-w-0 flex-1">
          <p className="truncate font-medium group-hover:text-primary">{mentor.displayName}</p>
          <p className="line-clamp-2 text-xs leading-5 text-muted-foreground">{mentor.headline}</p>
        </div>
      </div>
      <div className="flex flex-wrap gap-1.5">
        <Badge variant="outline" className="gap-1"><BadgeCheck className="h-3 w-3 text-primary" aria-hidden="true" /> {MENTOR_TIER_LABELS[mentor.tier]}</Badge>
        <MentorTrackBadge track={mentor.track} />
      </div>
      <ul className="flex flex-wrap gap-1.5" aria-label="Approved specializations">
        {mentor.qualifications.map((item) => (
          <li key={item.id} className="rounded-md bg-muted px-2 py-0.5 text-[11px] font-medium">{mentorSpecializationLabel(item.specializationId)}</li>
        ))}
      </ul>
      <p className="mt-auto flex items-center gap-1.5 text-[11px] text-muted-foreground"><Clock className="h-3 w-3" aria-hidden="true" /> {mentor.timezone}</p>
    </Link>
  );
}
