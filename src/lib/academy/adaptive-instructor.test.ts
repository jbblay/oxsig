import { describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));
vi.mock('@/lib/db/pool', () => ({ getPool: vi.fn() }));

import {
  calculateAcademyIndependence,
  instructorAssistanceWeight,
  nextProgressiveHintLevel,
  recommendAcademyInstructorMode,
} from './adaptive-instructor';

describe('Academy adaptive instructor policy', () => {
  it('starts with guided discovery when checkpoint-specific evidence is absent', () => {
    expect(recommendAcademyInstructorMode({
      understandingScore: 0,
      understandingStatus: 'not_started',
      latestReflectionScore: null,
      latestPracticeStatus: null,
      guideHintCount: 0,
    })).toMatchObject({ mode: 'guide' });
  });

  it('reduces assistance after demonstrated checkpoint understanding', () => {
    expect(recommendAcademyInstructorMode({
      understandingScore: 72,
      understandingStatus: 'demonstrated',
      latestReflectionScore: 84,
      latestPracticeStatus: 'passed',
      guideHintCount: 1,
    })).toMatchObject({ mode: 'observe' });
  });

  it('explains when the latest evidence-bound explanation exposes a large conceptual gap', () => {
    expect(recommendAcademyInstructorMode({
      understandingScore: 32,
      understandingStatus: 'developing',
      latestReflectionScore: 38,
      latestPracticeStatus: 'passed',
      guideHintCount: 0,
    })).toMatchObject({ mode: 'explain' });
  });

  it('escalates to demonstration only after the full hint sequence and unresolved difficulty', () => {
    expect(recommendAcademyInstructorMode({
      understandingScore: 45,
      understandingStatus: 'developing',
      latestReflectionScore: 58,
      latestPracticeStatus: 'needs-attention',
      guideHintCount: 3,
    })).toMatchObject({ mode: 'demonstrate' });
  });

  it('progresses guide hints from level 1 through level 3 and then caps', () => {
    expect(nextProgressiveHintLevel(0)).toBe(1);
    expect(nextProgressiveHintLevel(1)).toBe(2);
    expect(nextProgressiveHintLevel(2)).toBe(3);
    expect(nextProgressiveHintLevel(9)).toBe(3);
  });

  it('assigns deterministic support weights without penalizing observation', () => {
    expect(instructorAssistanceWeight('observe', 0)).toBe(0);
    expect(instructorAssistanceWeight('guide', 1)).toBe(10);
    expect(instructorAssistanceWeight('guide', 3)).toBe(35);
    expect(instructorAssistanceWeight('explain', 0)).toBe(30);
    expect(instructorAssistanceWeight('demonstrate', 0)).toBe(50);
  });

  it('keeps learner independence coverage-weighted and separate from understanding', () => {
    expect(calculateAcademyIndependence({
      requiredPractices: 2,
      reflectedLessonIds: ['lesson-1'],
      assistanceByLesson: {},
      instructorInterventions: 0,
    })).toEqual({
      reflectedPractices: 1,
      requiredPractices: 2,
      instructorInterventions: 0,
      score: 50,
      status: 'supported',
    });

    expect(calculateAcademyIndependence({
      requiredPractices: 2,
      reflectedLessonIds: ['lesson-1', 'lesson-2'],
      assistanceByLesson: { 'lesson-1': 10, 'lesson-2': 50 },
      instructorInterventions: 3,
    })).toEqual({
      reflectedPractices: 2,
      requiredPractices: 2,
      instructorInterventions: 3,
      score: 70,
      status: 'independent',
    });
  });
});
