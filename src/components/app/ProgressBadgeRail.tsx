'use client';

import { Award, Flame, ShieldCheck, Sparkles, Zap } from 'lucide-react';
import type { LearnerProgressSummary } from '@/lib/learning/progress-contract';

type ProgressBadgeRailProps = {
  progress: LearnerProgressSummary;
  compact?: boolean;
};

export default function ProgressBadgeRail({ progress, compact = false }: ProgressBadgeRailProps) {
  const earned = progress.rewards.badges.filter((badge) => badge.earned).slice(0, compact ? 2 : 4);

  return (
    <div className="oxsig-badge-rail" aria-label="Profile achievements">
      <span className="oxsig-achievement-chip" data-tone="level">
        <Zap className="h-3.5 w-3.5" />
        <strong>Lv {progress.rewards.level}</strong>
        <span>{progress.rewards.levelName}</span>
      </span>
      <span className="oxsig-achievement-chip" data-tone="xp">
        <Sparkles className="h-3.5 w-3.5" />
        <strong>{progress.rewards.xp.toLocaleString()}</strong>
        <span>XP</span>
      </span>
      <span className="oxsig-achievement-chip" data-tone="streak">
        <Flame className="h-3.5 w-3.5" />
        <strong>{progress.activity.streakDays}</strong>
        <span>day streak</span>
      </span>
      <span className="oxsig-achievement-chip" data-tone="badge">
        <Award className="h-3.5 w-3.5" />
        <strong>{progress.rewards.badgesEarned}</strong>
        <span>badges</span>
      </span>
      {earned.map((badge) => (
        <span key={badge.id} className="oxsig-achievement-chip" data-tone="earned" title={badge.description}>
          <ShieldCheck className="h-3.5 w-3.5" />
          <span>{badge.title}</span>
        </span>
      ))}
    </div>
  );
}
