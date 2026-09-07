import { describe, expect, it } from 'vitest';
import { buildLearningRewards, LEARNING_XP_RULES } from './rewards';

describe('learning rewards', () => {
  it('starts a new learner at zero XP with every achievement locked', () => {
    const rewards = buildLearningRewards({
      completedLessons: 0,
      masteredCourses: 0,
      passedPractices: 0,
      labsStarted: 0,
      activeDays: 0,
      longestStreakDays: 0,
    });

    expect(rewards.xp).toBe(0);
    expect(rewards.level).toBe(1);
    expect(rewards.levelName).toBe('Explorer');
    expect(rewards.levelProgressPercent).toBe(0);
    expect(rewards.badgesEarned).toBe(0);
    expect(rewards.badges.every((badge) => !badge.earned)).toBe(true);
  });

  it('derives XP only from persisted learning milestones, never lab runtime', () => {
    const rewards = buildLearningRewards({
      completedLessons: 2,
      masteredCourses: 1,
      passedPractices: 3,
      labsStarted: 2,
      activeDays: 4,
      longestStreakDays: 3,
    });

    expect(rewards.xp).toBe(
      (2 * LEARNING_XP_RULES.completedLesson) +
      LEARNING_XP_RULES.masteredCourse +
      (3 * LEARNING_XP_RULES.passedPractice) +
      (2 * LEARNING_XP_RULES.startedLab) +
      (4 * LEARNING_XP_RULES.activeDay)
    );
    expect(rewards.badges.find((badge) => badge.id === 'first-lesson')?.earned).toBe(true);
    expect(rewards.badges.find((badge) => badge.id === 'lab-starter')?.earned).toBe(true);
    expect(rewards.badges.find((badge) => badge.id === 'practice-proof')?.earned).toBe(true);
    expect(rewards.badges.find((badge) => badge.id === 'three-day-streak')?.earned).toBe(true);
    expect(rewards.badges.find((badge) => badge.id === 'seven-day-streak')?.earned).toBe(false);
  });

  it('keeps streak badges earned from the longest historical streak', () => {
    const rewards = buildLearningRewards({
      completedLessons: 0,
      masteredCourses: 0,
      passedPractices: 0,
      labsStarted: 0,
      activeDays: 10,
      longestStreakDays: 7,
    });

    expect(rewards.badges.find((badge) => badge.id === 'three-day-streak')?.earned).toBe(true);
    expect(rewards.badges.find((badge) => badge.id === 'seven-day-streak')?.earned).toBe(true);
  });
});
