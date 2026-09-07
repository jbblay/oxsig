import type { LearningBadgeProgress, LearnerProgressSummary } from './progress-contract';

export const LEARNING_XP_RULES = {
  completedLesson: 100,
  masteredCourse: 750,
  passedPractice: 75,
  startedLab: 100,
  activeDay: 25,
} as const;

type RewardInput = {
  completedLessons: number;
  masteredCourses: number;
  passedPractices: number;
  labsStarted: number;
  activeDays: number;
  longestStreakDays: number;
};

function nonNegativeInteger(value: number): number {
  return Math.max(0, Math.trunc(Number.isFinite(value) ? value : 0));
}

function levelFloorXp(level: number): number {
  if (level <= 1) return 0;
  return 250 * level * (level - 1);
}

function levelName(level: number): string {
  if (level <= 1) return 'Explorer';
  if (level === 2) return 'Learner';
  if (level === 3) return 'Practitioner';
  if (level === 4) return 'Builder';
  if (level === 5) return 'Operator';
  if (level === 6) return 'Specialist';
  if (level === 7) return 'Pathfinder';
  if (level === 8) return 'Mentor';
  return 'Vanguard';
}

function badge(
  id: string,
  title: string,
  description: string,
  current: number,
  target: number,
  unit: string
): LearningBadgeProgress {
  const safeCurrent = nonNegativeInteger(current);
  const safeTarget = Math.max(1, nonNegativeInteger(target));
  return {
    id,
    title,
    description,
    earned: safeCurrent >= safeTarget,
    current: safeCurrent,
    target: safeTarget,
    unit,
  };
}

export function buildLearningRewards(input: RewardInput): LearnerProgressSummary['rewards'] {
  const completedLessons = nonNegativeInteger(input.completedLessons);
  const masteredCourses = nonNegativeInteger(input.masteredCourses);
  const passedPractices = nonNegativeInteger(input.passedPractices);
  const labsStarted = nonNegativeInteger(input.labsStarted);
  const activeDays = nonNegativeInteger(input.activeDays);
  const longestStreakDays = nonNegativeInteger(input.longestStreakDays);

  const xp =
    (completedLessons * LEARNING_XP_RULES.completedLesson) +
    (masteredCourses * LEARNING_XP_RULES.masteredCourse) +
    (passedPractices * LEARNING_XP_RULES.passedPractice) +
    (labsStarted * LEARNING_XP_RULES.startedLab) +
    (activeDays * LEARNING_XP_RULES.activeDay);

  let level = 1;
  while (xp >= levelFloorXp(level + 1) && level < 100) level += 1;

  const floorXp = levelFloorXp(level);
  const nextXp = levelFloorXp(level + 1);
  const levelProgressPercent = nextXp > floorXp
    ? Math.max(0, Math.min(100, Math.round(((xp - floorXp) / (nextXp - floorXp)) * 100)))
    : 100;

  const badges = [
    badge('first-lesson', 'First lesson', 'Complete your first Academy lesson.', completedLessons, 1, 'lesson'),
    badge('lab-starter', 'Lab starter', 'Launch your first real Cyber Lab.', labsStarted, 1, 'lab'),
    badge('practice-proof', 'Practice proof', 'Pass your first practical checkpoint.', passedPractices, 1, 'practice'),
    badge('three-day-streak', 'Momentum', 'Reach a three-day learning streak.', longestStreakDays, 3, 'days'),
    badge('ten-lessons', 'Deepening', 'Complete ten Academy lessons.', completedLessons, 10, 'lessons'),
    badge('course-mastery', 'Course mastery', 'Master at least one Academy course.', masteredCourses, 1, 'course'),
    badge('lab-explorer', 'Lab explorer', 'Start five Cyber Lab environments.', labsStarted, 5, 'labs'),
    badge('seven-day-streak', 'Week on fire', 'Reach a seven-day learning streak.', longestStreakDays, 7, 'days'),
  ];

  return {
    xp,
    level,
    levelName: levelName(level),
    levelFloorXp: floorXp,
    nextLevelXp: nextXp,
    levelProgressPercent,
    badgesEarned: badges.filter((item) => item.earned).length,
    badges,
  };
}
