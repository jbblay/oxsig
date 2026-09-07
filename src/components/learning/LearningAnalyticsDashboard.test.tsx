import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { LearnerProgressSummary } from '@/lib/learning/progress-contract';
import { LearningAnalyticsDashboard } from './LearningAnalyticsDashboard';

const zeroProgress: LearnerProgressSummary = {
  academy: {
    courses: 0,
    masteredCourses: 0,
    completedLessons: 0,
    passedPractices: 0,
    averageMastery: 0,
    activeCourse: null,
  },
  labs: {
    started: 0,
    running: 0,
    runtimeMinutes: 0,
    activeLab: null,
  },
  activity: {
    streakDays: 0,
    longestStreakDays: 0,
    activeDays: 0,
    history: Array.from({ length: 14 }, (_, index) => ({
      date: `2026-08-${String(25 + index).padStart(2, '0')}`,
      academy: 0,
      labs: 0,
      total: 0,
    })),
  },
  rewards: {
    xp: 0,
    level: 1,
    levelName: 'Explorer',
    levelFloorXp: 0,
    nextLevelXp: 500,
    levelProgressPercent: 0,
    badgesEarned: 0,
    badges: [
      { id: 'first-lesson', title: 'First lesson', description: 'Complete your first Academy lesson.', earned: false, current: 0, target: 1, unit: 'lesson' },
      { id: 'lab-starter', title: 'Lab starter', description: 'Launch your first real Cyber Lab.', earned: false, current: 0, target: 1, unit: 'lab' },
    ],
  },
};

describe('LearningAnalyticsDashboard', () => {
  it('renders a truthful rich zero state instead of demo progress', () => {
    render(<LearningAnalyticsDashboard progress={zeroProgress} />);

    expect(screen.getByText('0 XP')).toBeInTheDocument();
    expect(screen.getByText('Explorer')).toBeInTheDocument();
    expect(screen.getByText('0/2 unlocked from real milestones.')).toBeInTheDocument();
    expect(screen.getByText('0m')).toBeInTheDocument();
    expect(screen.getAllByText('0').length).toBeGreaterThan(0);
  });

  it('lets a learner inspect a locked badge and its real unlock condition', () => {
    render(<LearningAnalyticsDashboard progress={zeroProgress} />);

    fireEvent.click(screen.getByRole('button', { name: /first lesson/i }));

    expect(screen.getByText('Locked')).toBeInTheDocument();
    expect(screen.getByText('0/1 lesson')).toBeInTheDocument();
    expect(screen.getByText(/persisted OXSIG learning history/i)).toBeInTheDocument();
  });
});
