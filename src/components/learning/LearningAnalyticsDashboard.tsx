'use client';

import { useState } from 'react';
import {
  Activity,
  Award,
  Clock3,
  Flame,
  Lock,
  ShieldCheck,
  Terminal,
  Trophy,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import type { LearnerProgressSummary, LearningBadgeProgress } from '@/lib/learning/progress-contract';

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

function ActivityStrip({ progress }: { progress: LearnerProgressSummary }) {
  return (
    <div className="grid grid-cols-[repeat(14,minmax(0,1fr))] gap-1 sm:gap-1.5" aria-label="Fourteen day activity">
      {progress.activity.history.map((day) => {
        const active = day.total > 0;
        const label = new Date(`${day.date}T00:00:00.000Z`).toLocaleDateString(undefined, {
          month: 'short',
          day: 'numeric',
          timeZone: 'UTC',
        });
        return (
          <div key={day.date} className="min-w-0 text-center" title={`${label}: ${day.total} recorded activit${day.total === 1 ? 'y' : 'ies'}`}>
            <div className={`mx-auto h-8 w-full max-w-7 rounded-md border ${active ? 'border-primary/30 bg-primary/65' : 'bg-muted/60'}`} />
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
  const progress = percentage(badge.current, badge.target);
  return (
    <button
      type="button"
      onClick={onOpen}
      className={`min-w-0 rounded-xl border p-3 text-left transition hover:border-primary/30 hover:shadow-sm ${badge.earned ? 'bg-card' : 'bg-muted/20'}`}
    >
      <div className="flex items-start justify-between gap-2">
        <span className={`flex h-9 w-9 items-center justify-center rounded-xl ${badge.earned ? 'bg-primary/10 text-primary' : 'bg-muted text-muted-foreground'}`}>
          <Award className="h-4 w-4" />
        </span>
        {badge.earned ? <ShieldCheck className="h-4 w-4 text-emerald-600" /> : <Lock className="h-4 w-4 text-muted-foreground" />}
      </div>
      <p className="mt-2 truncate text-sm font-semibold">{badge.title}</p>
      <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-muted">
        <div className="h-full rounded-full bg-primary transition-[width]" style={{ width: `${progress}%` }} />
      </div>
      <p className="mt-1.5 text-[10px] text-muted-foreground">{badge.earned ? 'Unlocked' : `${Math.min(badge.current, badge.target)}/${badge.target} ${badge.unit}`}</p>
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

  return (
    <section className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Card>
          <CardContent className="flex items-center gap-3 p-4">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary"><Trophy className="h-4 w-4" /></span>
            <div><p className="text-xl font-semibold">Level {progress.rewards.level}</p><p className="text-xs text-muted-foreground">{progress.rewards.levelName}</p></div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-3 p-4">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-muted"><Flame className="h-4 w-4" /></span>
            <div><p className="text-xl font-semibold">{progress.activity.streakDays}</p><p className="text-xs text-muted-foreground">day streak</p></div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-3 p-4">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-muted"><Terminal className="h-4 w-4" /></span>
            <div><p className="text-xl font-semibold">{progress.labs.started}</p><p className="text-xs text-muted-foreground">labs started</p></div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-3 p-4">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-muted"><Clock3 className="h-4 w-4" /></span>
            <div><p className="text-xl font-semibold">{formatRuntime(progress.labs.runtimeMinutes)}</p><p className="text-xs text-muted-foreground">lab runtime</p></div>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 xl:grid-cols-[0.85fr_1.15fr]">
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between gap-3">
              <div><CardTitle className="text-base">Activity</CardTitle><CardDescription>Last 14 days</CardDescription></div>
              <Activity className="h-4 w-4 text-muted-foreground" />
            </div>
          </CardHeader>
          <CardContent>
            <ActivityStrip progress={progress} />
            <div className="mt-3 flex items-center justify-between text-[10px] text-muted-foreground">
              <span>{progress.rewards.xp.toLocaleString()} XP</span>
              <span>Best streak: {progress.activity.longestStreakDays} days</span>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between gap-3">
              <div><CardTitle className="text-base">Milestones</CardTitle><CardDescription>{progress.rewards.badgesEarned}/{progress.rewards.badges.length} unlocked</CardDescription></div>
              <Award className="h-4 w-4 text-muted-foreground" />
            </div>
          </CardHeader>
          <CardContent className={`grid gap-2 ${compact ? 'grid-cols-2 sm:grid-cols-4' : 'grid-cols-2 md:grid-cols-4'}`}>
            {visibleBadges.map((badge) => <BadgeTile key={badge.id} badge={badge} onOpen={() => setSelectedBadge(badge)} />)}
          </CardContent>
        </Card>
      </div>

      <Dialog open={Boolean(selectedBadge)} onOpenChange={(open) => { if (!open) setSelectedBadge(null); }}>
        <DialogContent>
          {selectedBadge && (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2"><Award className="h-5 w-5" /> {selectedBadge.title}</DialogTitle>
                <DialogDescription>{selectedBadge.description}</DialogDescription>
              </DialogHeader>
              <div className="space-y-3">
                <Badge variant={selectedBadge.earned ? 'default' : 'outline'}>{selectedBadge.earned ? 'Unlocked' : 'In progress'}</Badge>
                <div className="h-2 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full bg-primary" style={{ width: `${percentage(selectedBadge.current, selectedBadge.target)}%` }} /></div>
                <p className="text-sm text-muted-foreground">{Math.min(selectedBadge.current, selectedBadge.target)}/{selectedBadge.target} {selectedBadge.unit}</p>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </section>
  );
}
