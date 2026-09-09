import { Crown, Ghost, LockKeyhole, Network, Skull, Swords } from 'lucide-react';

type VillainBadge = {
  id: string;
  title: string;
  description: string;
  criteria: string;
  icon: typeof Skull;
};

const villainBadges: VillainBadge[] = [
  {
    id: 'domain-villain',
    title: 'Domain Villain',
    description: 'Compromise an Active Directory Operation without walkthrough assistance.',
    criteria: '1 clean Operation',
    icon: Crown,
  },
  {
    id: 'root-reaper',
    title: 'Root Reaper',
    description: 'Submit valid root evidence in 25 challenge labs.',
    criteria: '25 validated roots',
    icon: Skull,
  },
  {
    id: 'ghost-operator',
    title: 'Ghost Operator',
    description: 'Complete a challenge without hints or AI assistance.',
    criteria: '1 clean solve',
    icon: Ghost,
  },
  {
    id: 'warlord',
    title: 'Warlord',
    description: 'Win 10 scored WarRoom challenges with a team.',
    criteria: '10 WarRoom wins',
    icon: Swords,
  },
  {
    id: 'pivot-phantom',
    title: 'Pivot Phantom',
    description: 'Complete five network-pivot Operations with validated evidence.',
    criteria: '5 validated pivots',
    icon: Network,
  },
];

export default function VillainBadgeGrid() {
  return (
    <section className="space-y-2" aria-labelledby="villain-badges-title">
      <div className="flex items-end justify-between gap-3">
        <div>
          <h2 id="villain-badges-title" className="text-sm font-semibold">Villain badges</h2>
          <p className="text-[11px] text-muted-foreground">Badge criteria preview. Automated progression and unlock tracking are not connected yet.</p>
        </div>
        <span className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground">Preview</span>
      </div>

      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
        {villainBadges.map((badge) => {
          const Icon = badge.icon;
          return (
            <div key={badge.id} className="group relative overflow-hidden rounded-lg border bg-card/60 p-3">
              <div className="absolute right-2 top-2 text-muted-foreground/40"><LockKeyhole className="h-3.5 w-3.5" /></div>
              <span className="mb-3 grid h-9 w-9 place-items-center rounded-md border bg-muted/30 text-muted-foreground transition group-hover:text-foreground">
                <Icon className="h-4 w-4" />
              </span>
              <p className="text-xs font-semibold">{badge.title}</p>
              <p className="mt-1 min-h-12 text-[10px] leading-4 text-muted-foreground">{badge.description}</p>
              <div className="mt-3 border-t pt-2 text-[10px] font-medium text-muted-foreground">Criteria: {badge.criteria}</div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
