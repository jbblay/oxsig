'use client';

import * as React from 'react';
import Link from 'next/link';
import {
  ArrowRight,
  BadgeCheck,
  BookOpen,
  Box,
  Check,
  ChevronRight,
  Flame,
  GitBranch,
  LockKeyhole,
  Radar,
  ServerCog,
  Shield,
  ShieldCheck,
  Skull,
  Sparkles,
  TerminalSquare,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

type PathId = 'red-team' | 'blue-team' | 'devops' | 'linux-admin';
type StageState = 'complete' | 'current' | 'ready' | 'locked';

type Stage = {
  title: string;
  description: string;
  state: StageState;
  practice?: string;
};

type CapabilityPath = {
  id: PathId;
  title: string;
  eyebrow: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
  badgeIcon: React.ComponentType<{ className?: string }>;
  badgeName: string;
  badgeDescription: string;
  accent: string;
  activeRing: string;
  hero: string;
  iconSurface: string;
  connector: string;
  stageCurrent: string;
  stageComplete: string;
  stages: Stage[];
};

const paths: CapabilityPath[] = [
  {
    id: 'red-team',
    title: 'Red Team',
    eyebrow: 'Offensive security',
    description: 'Build practical offensive capability from reconnaissance through exploitation, privilege escalation, pivoting and reporting.',
    icon: Skull,
    badgeIcon: Flame,
    badgeName: 'Operator: Ember',
    badgeDescription: 'Earned by demonstrating the first offensive practical capability.',
    accent: 'text-red-300',
    activeRing: 'border-red-500/60 bg-red-950/45 shadow-[0_0_40px_-18px_rgba(239,68,68,0.9)]',
    hero: 'border-red-500/30 bg-[radial-gradient(circle_at_top_right,rgba(239,68,68,0.22),transparent_38%),linear-gradient(135deg,rgba(10,10,10,0.98),rgba(38,5,8,0.94),rgba(8,8,8,0.98))] text-white',
    iconSurface: 'border-red-500/35 bg-red-500/10 text-red-300',
    connector: 'from-red-600/70 via-red-500/50 to-red-950/20',
    stageCurrent: 'border-red-500/55 bg-red-500/10 text-red-100 shadow-[0_0_28px_-16px_rgba(239,68,68,0.9)]',
    stageComplete: 'border-red-500/30 bg-red-950/40 text-red-100',
    stages: [
      { title: 'Foundations', description: 'Linux, networking and attack-surface thinking.', state: 'complete' },
      { title: 'Reconnaissance', description: 'Discover hosts, services and exposed attack surface.', state: 'current', practice: 'Recon range' },
      { title: 'Enumeration', description: 'Turn discovered services into actionable findings.', state: 'ready', practice: 'Service enumeration lab' },
      { title: 'Web exploitation', description: 'Practice supported web vulnerability workflows.', state: 'locked', practice: 'Web target range' },
      { title: 'Privilege escalation', description: 'Identify and validate local escalation paths.', state: 'locked', practice: 'Linux escalation lab' },
      { title: 'Pivoting & reporting', description: 'Move through controlled environments and document evidence.', state: 'locked', practice: 'Multi-stage scenario' },
    ],
  },
  {
    id: 'blue-team',
    title: 'Blue Team',
    eyebrow: 'Defensive security',
    description: 'Build detection and investigation capability through logs, network telemetry, incident response and forensic reasoning.',
    icon: ShieldCheck,
    badgeIcon: Shield,
    badgeName: 'Signal Guardian',
    badgeDescription: 'Earned by completing the first defensive investigation checkpoint.',
    accent: 'text-cyan-200',
    activeRing: 'border-cyan-400/55 bg-slate-900/65 shadow-[0_0_40px_-18px_rgba(34,211,238,0.8)]',
    hero: 'border-cyan-400/25 bg-[radial-gradient(circle_at_top_right,rgba(34,211,238,0.18),transparent_40%),linear-gradient(135deg,rgba(5,15,28,0.98),rgba(8,29,48,0.94),rgba(7,15,28,0.98))] text-white',
    iconSurface: 'border-cyan-400/30 bg-cyan-400/10 text-cyan-200',
    connector: 'from-cyan-500/70 via-sky-500/45 to-slate-900/20',
    stageCurrent: 'border-cyan-400/50 bg-cyan-400/10 text-cyan-50 shadow-[0_0_28px_-16px_rgba(34,211,238,0.85)]',
    stageComplete: 'border-cyan-400/25 bg-slate-900/45 text-cyan-50',
    stages: [
      { title: 'Defender foundations', description: 'Operating systems, networks and evidence fundamentals.', state: 'complete' },
      { title: 'Log analysis', description: 'Read host and application telemetry with purpose.', state: 'current', practice: 'Log triage lab' },
      { title: 'Network detection', description: 'Recognize suspicious traffic and service behavior.', state: 'ready', practice: 'Packet analysis lab' },
      { title: 'Incident investigation', description: 'Correlate evidence into an explainable timeline.', state: 'locked', practice: 'Incident case' },
      { title: 'Forensics', description: 'Inspect disk, memory and process artifacts.', state: 'locked', practice: 'Forensics workstation' },
      { title: 'Detection engineering', description: 'Turn observed behavior into durable detections.', state: 'locked', practice: 'Detection workshop' },
    ],
  },
  {
    id: 'devops',
    title: 'DevOps',
    eyebrow: 'Delivery & reliability',
    description: 'Move from Linux and Git into containers, delivery automation, infrastructure, observability and reliable operations.',
    icon: GitBranch,
    badgeIcon: ServerCog,
    badgeName: 'Pipeline Builder',
    badgeDescription: 'Earned by shipping the first verified automated delivery workflow.',
    accent: 'text-violet-200',
    activeRing: 'border-violet-400/55 bg-slate-900/65 shadow-[0_0_40px_-18px_rgba(167,139,250,0.8)]',
    hero: 'border-violet-400/25 bg-[radial-gradient(circle_at_top_right,rgba(139,92,246,0.2),transparent_40%),linear-gradient(135deg,rgba(13,10,30,0.98),rgba(27,18,58,0.95),rgba(8,20,20,0.98))] text-white',
    iconSurface: 'border-violet-400/30 bg-violet-400/10 text-violet-200',
    connector: 'from-violet-500/70 via-emerald-500/35 to-slate-900/20',
    stageCurrent: 'border-violet-400/50 bg-violet-400/10 text-violet-50 shadow-[0_0_28px_-16px_rgba(167,139,250,0.8)]',
    stageComplete: 'border-violet-400/25 bg-slate-900/45 text-violet-50',
    stages: [
      { title: 'Linux & Git', description: 'Operate confidently and version changes safely.', state: 'complete' },
      { title: 'Containers', description: 'Package and run repeatable services.', state: 'current', practice: 'Container lab' },
      { title: 'CI/CD', description: 'Automate validation and delivery with traceable gates.', state: 'ready', practice: 'Pipeline lab' },
      { title: 'Infrastructure', description: 'Design controlled environments and deployment plans.', state: 'locked', practice: 'Infrastructure exercise' },
      { title: 'Observability', description: 'Measure services with metrics, logs and actionable signals.', state: 'locked', practice: 'Observability stack' },
      { title: 'Reliability', description: 'Practice safe changes, recovery and operational reasoning.', state: 'locked', practice: 'Failure scenario' },
    ],
  },
  {
    id: 'linux-admin',
    title: 'Linux Admin',
    eyebrow: 'Systems administration',
    description: 'Build durable Linux operations capability across storage, services, networking, security and troubleshooting.',
    icon: TerminalSquare,
    badgeIcon: BadgeCheck,
    badgeName: 'Rooted Operator',
    badgeDescription: 'Earned by demonstrating reliable Linux service administration.',
    accent: 'text-amber-200',
    activeRing: 'border-amber-400/55 bg-stone-950/65 shadow-[0_0_40px_-18px_rgba(251,191,36,0.72)]',
    hero: 'border-amber-400/25 bg-[radial-gradient(circle_at_top_right,rgba(245,158,11,0.17),transparent_40%),linear-gradient(135deg,rgba(20,15,8,0.98),rgba(42,28,7,0.95),rgba(13,17,18,0.98))] text-white',
    iconSurface: 'border-amber-400/30 bg-amber-400/10 text-amber-200',
    connector: 'from-amber-500/70 via-orange-500/35 to-stone-950/20',
    stageCurrent: 'border-amber-400/50 bg-amber-400/10 text-amber-50 shadow-[0_0_28px_-16px_rgba(251,191,36,0.8)]',
    stageComplete: 'border-amber-400/25 bg-stone-950/45 text-amber-50',
    stages: [
      { title: 'Command line', description: 'Navigate, inspect and manipulate Linux systems.', state: 'complete' },
      { title: 'Users & permissions', description: 'Control identities, groups and access safely.', state: 'current', practice: 'Permissions lab' },
      { title: 'Services & systemd', description: 'Operate and troubleshoot managed services.', state: 'ready', practice: 'Service recovery lab' },
      { title: 'Storage & networking', description: 'Administer filesystems, mounts and network services.', state: 'locked', practice: 'Systems lab' },
      { title: 'Security controls', description: 'Practice firewalls, SELinux and least privilege.', state: 'locked', practice: 'Hardening lab' },
      { title: 'Troubleshooting', description: 'Diagnose failures using evidence instead of guesses.', state: 'locked', practice: 'Break/fix scenario' },
    ],
  },
];

function stateLabel(state: StageState) {
  if (state === 'complete') return 'Demonstrated';
  if (state === 'current') return 'In progress';
  if (state === 'ready') return 'Ready next';
  return 'Locked';
}

export function CapabilityPathExplorer() {
  const [selectedId, setSelectedId] = React.useState<PathId>('red-team');
  const [showAll, setShowAll] = React.useState(false);
  const selected = paths.find((path) => path.id === selectedId) ?? paths[0];
  const SelectedIcon = selected.icon;
  const BadgeIcon = selected.badgeIcon;
  const visiblePaths = showAll ? paths : paths.slice(0, 4);

  return (
    <section className="space-y-4" aria-labelledby="capability-paths-heading">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">Choose a capability path</p>
          <h2 id="capability-paths-heading" className="mt-1 text-2xl font-semibold tracking-tight">What do you want to become capable of?</h2>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">Paths connect teaching, practical labs and demonstrated skills into one persistent journey.</p>
        </div>
        <Button type="button" variant="ghost" size="sm" onClick={() => setShowAll((value) => !value)}>
          {showAll ? 'Show featured' : 'View all paths'} <ChevronRight className={cn('h-4 w-4 transition-transform', showAll && 'rotate-90')} />
        </Button>
      </div>

      <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4" role="tablist" aria-label="Capability paths">
        {visiblePaths.map((path) => {
          const Icon = path.icon;
          const active = path.id === selected.id;
          return (
            <button
              key={path.id}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => setSelectedId(path.id)}
              className={cn(
                'group min-h-24 rounded-2xl border bg-card p-4 text-left transition-all duration-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                active ? path.activeRing : 'hover:-translate-y-0.5 hover:border-foreground/20 hover:shadow-sm'
              )}
            >
              <div className="flex items-start justify-between gap-3">
                <span className={cn('flex h-10 w-10 items-center justify-center rounded-xl border transition-transform duration-300 group-hover:scale-105', active ? path.iconSurface : 'bg-muted/60 text-muted-foreground')}>
                  <Icon className="h-5 w-5" />
                </span>
                {active && <span className={cn('h-2.5 w-2.5 rounded-full motion-safe:animate-pulse', path.id === 'red-team' ? 'bg-red-500' : path.id === 'blue-team' ? 'bg-cyan-400' : path.id === 'devops' ? 'bg-violet-400' : 'bg-amber-400')} />}
              </div>
              <p className="mt-3 font-semibold">{path.title}</p>
              <p className="mt-0.5 text-xs text-muted-foreground">{path.eyebrow}</p>
            </button>
          );
        })}
      </div>

      <div key={selected.id} className={cn('relative overflow-hidden rounded-3xl border p-5 shadow-sm sm:p-6 lg:p-8 motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-bottom-2 motion-safe:duration-500', selected.hero)}>
        <div className="pointer-events-none absolute inset-0 opacity-40 [background-image:linear-gradient(rgba(255,255,255,0.035)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.035)_1px,transparent_1px)] [background-size:28px_28px]" />
        <div className="relative grid gap-8 xl:grid-cols-[0.72fr_1.28fr]">
          <div className="min-w-0">
            <div className="flex items-center gap-3">
              <span className={cn('flex h-12 w-12 items-center justify-center rounded-2xl border backdrop-blur', selected.iconSurface)}><SelectedIcon className="h-6 w-6" /></span>
              <div>
                <p className={cn('text-xs font-semibold uppercase tracking-[0.2em]', selected.accent)}>{selected.eyebrow}</p>
                <h3 className="text-2xl font-semibold">{selected.title}</h3>
              </div>
            </div>
            <p className="mt-4 max-w-xl text-sm leading-6 text-white/70">{selected.description}</p>

            <div className="mt-6 rounded-2xl border border-white/10 bg-black/20 p-4 backdrop-blur-sm">
              <div className="flex items-start gap-3">
                <div className={cn('relative flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl border', selected.iconSurface)}>
                  <BadgeIcon className="h-7 w-7 motion-safe:animate-pulse" />
                  <span className="absolute -right-1 -top-1 h-3 w-3 rounded-full border-2 border-black bg-white/80" />
                </div>
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2"><p className="font-semibold">{selected.badgeName}</p><Badge className="border-white/15 bg-white/10 text-white hover:bg-white/10">Path badge</Badge></div>
                  <p className="mt-1 text-xs leading-5 text-white/60">{selected.badgeDescription}</p>
                </div>
              </div>
            </div>

            <div className="mt-6 flex flex-wrap gap-2">
              <Button asChild className="bg-white text-black hover:bg-white/90"><Link href="/academy"><BookOpen className="h-4 w-4" /> Start with foundations</Link></Button>
              <Button asChild variant="outline" className="border-white/20 bg-white/5 text-white hover:bg-white/10 hover:text-white"><Link href="/labs"><Box className="h-4 w-4" /> Practice now</Link></Button>
            </div>
          </div>

          <div className="min-w-0" aria-label={`${selected.title} roadmap`}>
            <div className="mb-4 flex items-center justify-between gap-3">
              <div><p className="text-sm font-semibold">Capability roadmap</p><p className="text-xs text-white/55">Progress represents demonstrated capability, not content consumption.</p></div>
              <Radar className={cn('h-5 w-5 shrink-0', selected.accent)} />
            </div>

            <div className="relative space-y-0">
              {selected.stages.map((stage, index) => {
                const complete = stage.state === 'complete';
                const current = stage.state === 'current';
                const ready = stage.state === 'ready';
                return (
                  <div key={stage.title} className="relative grid grid-cols-[36px_1fr] gap-3">
                    {index < selected.stages.length - 1 && <div className={cn('absolute left-[17px] top-9 h-[calc(100%-10px)] w-px bg-gradient-to-b', selected.connector)} />}
                    <div className={cn(
                      'relative z-10 mt-1 flex h-9 w-9 items-center justify-center rounded-full border text-xs backdrop-blur-sm transition-all duration-300',
                      complete ? selected.stageComplete : current ? selected.stageCurrent : ready ? 'border-white/25 bg-white/10 text-white' : 'border-white/10 bg-black/30 text-white/35'
                    )}>
                      {complete ? <Check className="h-4 w-4" /> : current ? <Sparkles className="h-4 w-4 motion-safe:animate-pulse" /> : ready ? <ArrowRight className="h-4 w-4" /> : <LockKeyhole className="h-3.5 w-3.5" />}
                    </div>
                    <div className={cn('mb-3 rounded-2xl border p-3.5 transition-all duration-300', current ? selected.stageCurrent : complete ? selected.stageComplete : ready ? 'border-white/15 bg-white/[0.06]' : 'border-white/[0.07] bg-black/15 opacity-65')}>
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <div className="min-w-0"><p className="text-sm font-semibold">{stage.title}</p><p className="mt-1 text-xs leading-5 text-white/55">{stage.description}</p></div>
                        <Badge variant="outline" className={cn('border-white/15 bg-black/15 text-[10px] text-white/70', current && selected.accent)}>{stateLabel(stage.state)}</Badge>
                      </div>
                      {stage.practice && (current || ready) && <p className="mt-2 flex items-center gap-1.5 text-[11px] text-white/55"><Box className="h-3.5 w-3.5" /> Practical: {stage.practice}</p>}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
