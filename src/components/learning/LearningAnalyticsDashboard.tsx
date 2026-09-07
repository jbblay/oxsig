'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import {
  Activity,
  Award,
  BookOpenCheck,
  Clock3,
  Flame,
  GraduationCap,
  Lock,
  Medal,
  ShieldCheck,
  Sparkles,
  Target,
  Terminal,
  Trophy,
  Zap,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import type { LearnerProgressSummary, LearningBadgeProgress } from '@/lib/learning/progress-contract';

const badgeVisuals: Record<string, { icon: typeof Award; classes: string }> = {
  'first-lesson': { icon: BookOpenCheck, classes: 'bg-sky-500/15 text-sky-600 dark:text-sky-400' },
  'lab-starter': { icon: Terminal, classes: 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400' },
  'practice-proof': { icon: Target, classes: 'bg-violet-500/15 text-violet-600 dark:text-violet-400' },
  'three-day-streak': { icon: Flame, classes: 'bg-orange-500/15 text-orange-600 dark:text-orange-400' },
  'ten-lessons': { icon: Medal, classes: 'bg-cyan-500/15 text-cyan-600 dark:text-cyan-400' },
  'course-mastery': { icon: Trophy, classes: 'bg-amber-500/15 text-amber-600 dark:text-amber-400' },
  'lab-explorer': { icon: Zap, classes: 'bg-rose-500/15 text-rose-600 dark:text-rose-400' },
  'seven-day-streak': { icon: Award, classes: 'bg-fuchsia-500/15 text-fuchsia-600 dark:text-fuchsia-400' },
};

function formatRuntime(minutes: number): string {
  const safeMinutes = Math.max(0, Math.trunc(minutes));
  if (safeMinutes < 60) return `${safeMinutes}m`;
  const hours = safeMinutes / 60;
  return hours >= 10 ? `${Math.round(hours)}h` : `${hours.toFixed(1)}h`;
}

function percentage(current: number, target: number): number {
  if (target <= 0) return 100;
  return Math.max(0, Math.min(100, Math.round((current / target) * 100)));
}

function LevelRing({ progress, level }: { progress: number; level: number }) {
  const safe = Math.max(0, Math.min(100, progress));
  return (
    <div className="relative h-32 w-32 shrink-0">
      <svg viewBox="0 0 120 120" className="h-full w-full -rotate-90" aria-label={`${safe}% progress through level ${level}`}>
        <circle cx="60" cy="60" r="51" fill="none" stroke="currentColor" strokeWidth="9" className="text-muted" />
        <circle
          cx="60"
          cy="60"
          r="51"
          fill="none"
          stroke="currentColor"
          strokeWidth="9"
          strokeLinecap="round"
          pathLength="100"
          strokeDasharray={`${safe} 100`}
          className="text-primary transition-all duration-500"
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Level</span>
        <span className="text-3xl font-bold">{level}</span>
      </div>
    </div>
  );
}

function ActivityStrip({ progress }: { progress: LearnerProgressSummary }) {
  return (
    <div className="grid grid-cols-[repeat(14,minmax(0,1fr))] gap-1.5" aria-label="Fourteen day learning activity">
      {progress.activity.history.map((day) => {
        const active = day.total > 0;
        const both = day.academy > 0 && day.labs > 0;
        const label = new Date(`${day.date}T00:00:00.000Z`).toLocaleDateString(undefined, {
          month: 'short',
          day: 'numeric',
          timeZone: 'UTC',
        });
        const detail = both ? 'Academy + lab' : day.academy ? 'Academy' : day.labs ? 'Cyber Lab' : 'No recorded activity';
        return (
          <div key={day.date} className="min-w-0 text-center" title={`${label}: ${detail}`}>
            <div
              className={`mx-auto h-9 w-full max-w-7 rounded-md border transition-transform hover:-translate-y-0.5 ${
                both
                  ? 'border-violet-500/30 bg-gradient-to-t from-emerald-500/70 to-violet-500/70'
                  : day.academy
                    ? 'border-violet-500/30 bg-violet-500/65'
                    : day.labs
                      ? 'border-emerald-500/30 bg-emerald-500/65'
                      : 'bg-muted/60'
              }`}
            />
            <span className={`mt-1 block text-[9px] ${active ? 'font-medium text-foreground' : 'text-muted-foreground'}`}>
              {new Date(`${day.date}T00:00:00.000Z`).toLocaleDateString(undefined, { weekday: 'narrow', timeZone: 'UTC' })}
            </span>
          </div>
        );
      })}
    </div>
  );
}

function BadgeTile({ badge, onOpen }: { badge: LearningBadgeProgress; onOpen: () => void }) {
  const visual = badgeVisuals[badge.id] || { icon: Award, classes: 'bg-primary/10 text-primary' };
  const Icon = visual.icon;
  const progress = percentage(badge.current, badge.target);

  return (
    <button
      type="button"
      onClick={onOpen}
      className={`group relative min-w-0 rounded-2xl border p-4 text-left transition-all hover:-translate-y-0.5 hover:shadow-md ${
        badge.earned ? 'bg-card' : 'bg-muted/20'
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <span className={`flex h-11 w-11 items-center justify-center rounded-2xl ${badge.earned ? visual.classes : 'bg-muted text-muted-foreground'}`}>
          <Icon className="h-5 w-5" />
        </span>
        {badge.earned ? (
          <span className="flex h-6 w-6 items-center justify-center rounded-full bg-emerald-500/15 text-emerald-600 dark:text-emerald-400"><ShieldCheck className="h-3.5 w-3.5" /></span>
        ) : (
          <span className="flex h-6 w-6 items-center justify-center rounded-full bg-muted text-muted-foreground"><Lock className="h-3.5 w-3.5" /></span>
        )}
      </div>
      <p className="mt-3 truncate text-sm font-semibold">{badge.title}</p>
      <p className="mt-1 line-clamp-2 text-xs leading-5 text-muted-foreground">{badge.description}</p>
      <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-muted">
        <div className={`h-full rounded-full transition-all ${badge.earned ? 'bg-emerald-500' : 'bg-primary/60'}`} style={{ width: `${progress}%` }} />
      </div>
      <p className="mt-1.5 text-[10px] font-medium text-muted-foreground">
        {badge.earned ? 'Unlocked' : `${Math.min(badge.current, badge.target)}/${badge.target} ${badge.unit}`}
      </p>
    </button>
  );
}

export function LearningAnalyticsDashboard({
  progress,
  compact = false,
}: {
  progress: LearnerProgressSummary;
  compact?: boolean;
}) {
  const [selectedBadge, setSelectedBadge] = useState<LearningBadgeProgress | null>(null);
  const visibleBadges = compact ? progress.rewards.badges.slice(0, 4) : progress.rewards.badges;
  const nextBadge = useMemo(() => {
    return progress.rewards.badges
      .filter((item) => !item.earned)
      .sort((a, b) => percentage(b.current, b.target) - percentage(a.current, a.target))[0] || null;
  }, [progress.rewards.badges]);
  const xpIntoLevel = Math.max(0, progress.rewards.xp - progress.rewards.levelFloorXp);
  const xpLevelSpan = Math.max(1, progress.rewards.nextLevelXp - progress.rewards.levelFloorXp);

  return (
    <section className="space-y-4">
      <div className="grid gap-4 xl:grid-cols-[1.1fr_0.9fr]">
        <Card className="overflow-hidden border-primary/20 bg-gradient-to-br from-primary/10 via-background to-violet-500/10">
          <CardContent className="flex flex-col gap-6 p-6 sm:flex-row sm:items-center">
            <LevelRing progress={progress.rewards.levelProgressPercent} level={progress.rewards.level} />
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <Badge className="gap-1.5"><Sparkles className="h-3.5 w-3.5" /> {progress.rewards.levelName}</Badge>
                <Badge variant="outline">{progress.rewards.xp.toLocaleString()} XP</Badge>
              </div>
              <h2 className="mt-3 text-2xl font-semibold tracking-tight">Your learning power</h2>
              <p className="mt-1 text-sm leading-6 text-muted-foreground">
                Every point here comes from recorded Academy progress, verified practice, Cyber Lab launches, or active learning days.
              </p>
              <div className="mt-4">
                <div className="flex items-center justify-between text-xs font-medium">
                  <span>{xpIntoLevel.toLocaleString()} XP in this level</span>
                  <span>{xpLevelSpan.toLocaleString()} XP to fill</span>
                </div>
                <div className="mt-2 h-2.5 overflow-hidden rounded-full bg-muted">
                  <div className="h-full rounded-full bg-gradient-to-r from-primary to-violet-500 transition-all duration-500" style={{ width: `${progress.rewards.levelProgressPercent}%` }} />
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between gap-3">
              <div>
                <CardDescription>Next unlock</CardDescription>
                <CardTitle className="mt-1 text-lg">{nextBadge ? nextBadge.title : 'Badge shelf complete'}</CardTitle>
              </div>
              <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-amber-500/15 text-amber-600 dark:text-amber-400">
                <Trophy className="h-5 w-5" />
              </span>
            </div>
          </CardHeader>
          <CardContent>
            {nextBadge ? (
              <>
                <p className="text-sm leading-6 text-muted-foreground">{nextBadge.description}</p>
                <div className="mt-4 flex items-center justify-between text-xs font-medium">
                  <span>{Math.min(nextBadge.current, nextBadge.target)}/{nextBadge.target} {nextBadge.unit}</span>
                  <span>{percentage(nextBadge.current, nextBadge.target)}%</span>
                </div>
                <div className="mt-2 h-2 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full bg-amber-500" style={{ width: `${percentage(nextBadge.current, nextBadge.target)}%` }} /></div>
              </>
            ) : (
              <p className="text-sm leading-6 text-muted-foreground">Every current OXSIG learning milestone is unlocked. New reward paths can be added without inventing activity.</p>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Card className="border-orange-500/20"><CardContent className="flex items-center gap-3 p-4"><span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-orange-500/15 text-orange-600 dark:text-orange-400"><Flame className="h-5 w-5" /></span><div><p className="text-2xl font-semibold">{progress.activity.streakDays}</p><p className="text-xs text-muted-foreground">day current streak</p></div></CardContent></Card>
        <Card className="border-sky-500/20"><CardContent className="flex items-center gap-3 p-4"><span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-sky-500/15 text-sky-600 dark:text-sky-400"><BookOpenCheck className="h-5 w-5" /></span><div><p className="text-2xl font-semibold">{progress.academy.completedLessons}</p><p className="text-xs text-muted-foreground">lessons completed</p></div></CardContent></Card>
        <Card className="border-emerald-500/20"><CardContent className="flex items-center gap-3 p-4"><span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-emerald-500/15 text-emerald-600 dark:text-emerald-400"><Terminal className="h-5 w-5" /></span><div><p className="text-2xl font-semibold">{progress.labs.started}</p><p className="text-xs text-muted-foreground">labs started</p></div></CardContent></Card>
        <Card className="border-violet-500/20"><CardContent className="flex items-center gap-3 p-4"><span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-violet-500/15 text-violet-600 dark:text-violet-400"><Clock3 className="h-5 w-5" /></span><div><p className="text-2xl font-semibold">{formatRuntime(progress.labs.runtimeMinutes)}</p><p className="text-xs text-muted-foreground">recorded lab runtime</p></div></CardContent></Card>
      </div>

      <div className="grid gap-4 xl:grid-cols-[0.9fr_1.1fr]">
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between gap-3">
              <div><CardTitle className="text-base">Learning rhythm</CardTitle><CardDescription>Last 14 UTC days from recorded learning activity.</CardDescription></div>
              <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/10 text-primary"><Activity className="h-4 w-4" /></span>
            </div>
          </CardHeader>
          <CardContent>
            <ActivityStrip progress={progress} />
            <div className="mt-4 flex flex-wrap gap-3 text-[10px] text-muted-foreground">
              <span className="inline-flex items-center gap-1.5"><span className="h-2 w-2 rounded-sm bg-violet-500/65" /> Academy</span>
              <span className="inline-flex items-center gap-1.5"><span className="h-2 w-2 rounded-sm bg-emerald-500/65" /> Cyber Lab</span>
              <span className="ml-auto">Best streak: {progress.activity.longestStreakDays} days</span>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <div className="flex flex-wrap items-end justify-between gap-2">
              <div><CardTitle className="text-base">Badge shelf</CardTitle><CardDescription>{progress.rewards.badgesEarned}/{progress.rewards.badges.length} unlocked from real milestones.</CardDescription></div>
              {compact && <Button asChild variant="ghost" size="sm"><Link href="/account">View all</Link></Button>}
            </div>
          </CardHeader>
          <CardContent className={`grid gap-3 ${compact ? 'grid-cols-2 sm:grid-cols-4' : 'grid-cols-2 md:grid-cols-4'}`}>
            {visibleBadges.map((item) => <BadgeTile key={item.id} badge={item} onOpen={() => setSelectedBadge(item)} />)}
          </CardContent>
        </Card>
      </div>

      {!compact && (
        <div className="grid gap-3 sm:grid-cols-3">
          <Card><CardContent className="flex items-center gap-3 p-4"><span className="flex h-10 w-10 items-center justify-center rounded-xl bg-violet-500/15 text-violet-600 dark:text-violet-400"><Target className="h-5 w-5" /></span><div><p className="text-xl font-semibold">{progress.academy.passedPractices}</p><p className="text-xs text-muted-foreground">verified practices</p></div></CardContent></Card>
          <Card><CardContent className="flex items-center gap-3 p-4"><span className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-500/15 text-amber-600 dark:text-amber-400"><GraduationCap className="h-5 w-5" /></span><div><p className="text-xl font-semibold">{progress.academy.masteredCourses}</p><p className="text-xs text-muted-foreground">courses mastered</p></div></CardContent></Card>
          <Card><CardContent className="flex items-center gap-3 p-4"><span className="flex h-10 w-10 items-center justify-center rounded-xl bg-cyan-500/15 text-cyan-600 dark:text-cyan-400"><Activity className="h-5 w-5" /></span><div><p className="text-xl font-semibold">{progress.activity.activeDays}</p><p className="text-xs text-muted-foreground">recorded active days</p></div></CardContent></Card>
        </div>
      )}

      <Dialog open={Boolean(selectedBadge)} onOpenChange={(open) => { if (!open) setSelectedBadge(null); }}>
        <DialogContent>
          {selectedBadge && (() => {
            const visual = badgeVisuals[selectedBadge.id] || { icon: Award, classes: 'bg-primary/10 text-primary' };
            const Icon = visual.icon;
            return (
              <>
                <DialogHeader>
                  <div className="mb-2 flex items-center gap-3">
                    <span className={`flex h-12 w-12 items-center justify-center rounded-2xl ${selectedBadge.earned ? visual.classes : 'bg-muted text-muted-foreground'}`}><Icon className="h-6 w-6" /></span>
                    <div>
                      <Badge variant={selectedBadge.earned ? 'default' : 'outline'}>{selectedBadge.earned ? 'Unlocked' : 'Locked'}</Badge>
                      <DialogTitle className="mt-1.5">{selectedBadge.title}</DialogTitle>
                    </div>
                  </div>
                  <DialogDescription>{selectedBadge.description}</DialogDescription>
                </DialogHeader>
                <div className="rounded-xl border bg-muted/20 p-4">
                  <div className="flex items-center justify-between text-sm font-medium"><span>Milestone progress</span><span>{Math.min(selectedBadge.current, selectedBadge.target)}/{selectedBadge.target} {selectedBadge.unit}</span></div>
                  <div className="mt-3 h-2.5 overflow-hidden rounded-full bg-muted"><div className={`h-full rounded-full ${selectedBadge.earned ? 'bg-emerald-500' : 'bg-primary'}`} style={{ width: `${percentage(selectedBadge.current, selectedBadge.target)}%` }} /></div>
                  <p className="mt-3 text-xs leading-5 text-muted-foreground">This badge is calculated from your persisted OXSIG learning history. It is not demo data or a manually assigned reward.</p>
                </div>
              </>
            );
          })()}
        </DialogContent>
      </Dialog>
    </section>
  );
}
