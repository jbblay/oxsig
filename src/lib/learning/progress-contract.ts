export type LearningActivityDay = {
  date: string;
  academy: number;
  labs: number;
  total: number;
};

export type LearningBadgeProgress = {
  id: string;
  title: string;
  description: string;
  earned: boolean;
  current: number;
  target: number;
  unit: string;
};

export type LearnerProgressSummary = {
  academy: {
    courses: number;
    masteredCourses: number;
    completedLessons: number;
    passedPractices: number;
    averageMastery: number;
    activeCourse: {
      title: string;
      completedLessons: number;
      totalLessons: number;
      score: number;
    } | null;
  };
  labs: {
    started: number;
    running: number;
    runtimeMinutes: number;
    activeLab: {
      name: string;
      status: string;
      expiresAt: string | null;
    } | null;
  };
  activity: {
    streakDays: number;
    longestStreakDays: number;
    activeDays: number;
    history: LearningActivityDay[];
  };
  rewards: {
    xp: number;
    level: number;
    levelName: string;
    levelFloorXp: number;
    nextLevelXp: number;
    levelProgressPercent: number;
    badgesEarned: number;
    badges: LearningBadgeProgress[];
  };
};
