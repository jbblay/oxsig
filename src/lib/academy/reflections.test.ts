import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  poolQuery: vi.fn(),
  transaction: vi.fn(),
}));

vi.mock('server-only', () => ({}));
vi.mock('@/lib/db/pool', () => ({
  getPool: () => ({ query: mocks.poolQuery }),
  transaction: mocks.transaction,
}));

import {
  AcademyReflectionError,
  claimAcademyReflection,
  completeAcademyReflection,
  createAcademyPrediction,
} from './reflections';

const reflectionId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const evidenceId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const courseId = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const ownerId = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';

const course = {
  title: 'Linux Basics',
  topic: 'Linux',
  level: 'beginner' as const,
  overview: 'Learn Linux.',
  estimatedMinutes: 60,
  objectives: ['Inspect a system', 'Explain evidence'],
  prerequisites: [],
  lessons: [
    {
      id: 'lesson-1',
      title: 'Inspect the kernel',
      summary: 'Inspect kernel details.',
      explanation: 'uname reports kernel and machine information.',
      keyPoints: ['Kernel release', 'Architecture'],
      visual: { title: 'Kernel view', nodes: ['Command', 'Kernel', 'Output'] },
      practice: {
        title: 'Run uname',
        instruction: 'Inspect kernel information.',
        command: 'uname -a',
        expected: 'Kernel and architecture details.',
        labRequired: true,
      },
      checkpoint: 'What does the output tell you?',
    },
    {
      id: 'lesson-2',
      title: 'Inspect identity',
      summary: 'Inspect user identity.',
      explanation: 'id reports user and group identity.',
      keyPoints: ['UID', 'GID'],
      visual: { title: 'Identity view', nodes: ['Command', 'Process', 'Identity'] },
      practice: {
        title: 'Run id',
        instruction: 'Inspect process identity.',
        command: 'id',
        expected: 'UID and GID details.',
        labRequired: true,
      },
      checkpoint: 'What identity is active?',
    },
    {
      id: 'lesson-3',
      title: 'Review',
      summary: 'Review the model.',
      explanation: 'Connect the concepts.',
      keyPoints: ['Kernel', 'Identity'],
      visual: { title: 'Review', nodes: ['Kernel', 'Identity'] },
      practice: null,
      checkpoint: 'Connect the concepts.',
    },
  ],
};

function reflectionRow(overrides: Record<string, unknown> = {}) {
  return {
    id: reflectionId,
    course_id: courseId,
    owner_id: ownerId,
    lesson_id: 'lesson-1',
    command: 'uname -a',
    prediction: 'I expect kernel and architecture details.',
    evidence_id: null,
    explanation: null,
    evaluation: null,
    explanation_score: null,
    model: null,
    status: 'predicted',
    evidence_bound_at: null,
    evaluation_started_at: null,
    reflected_at: null,
    created_at: '2026-09-06T05:00:00.000Z',
    updated_at: '2026-09-06T05:00:00.000Z',
    ...overrides,
  };
}

function evidenceRow(overrides: Record<string, unknown> = {}) {
  return {
    id: evidenceId,
    lab_instance_id: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
    command: 'uname -a',
    stdout: 'Linux lab 6.8.0 x86_64',
    stderr: '',
    exit_code: 0,
    state: 'analyzed',
    analysis_kind: 'academy',
    analysis: { status: 'passed', summary: 'Kernel details observed.' },
    created_at: '2026-09-06T05:01:00.000Z',
    execution_started_at: '2026-09-06T05:01:05.000Z',
    ...overrides,
  };
}

describe('Academy prediction and reflection lifecycle', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('derives the predicted command from the active server-side lesson', async () => {
    mocks.poolQuery
      .mockResolvedValueOnce({ rows: [{ id: courseId, course_data: course }] })
      .mockResolvedValueOnce({ rows: [reflectionRow()] });

    const result = await createAcademyPrediction({
      ownerId,
      courseTitle: course.title,
      lessonTitle: 'Inspect the kernel',
      prediction: '  I expect kernel and architecture details.  ',
    });

    expect(result.command).toBe('uname -a');
    expect(mocks.poolQuery).toHaveBeenLastCalledWith(
      expect.stringContaining('INSERT INTO academy_learning_reflections'),
      [courseId, ownerId, 'lesson-1', 'uname -a', 'I expect kernel and architecture details.']
    );
  });

  it('rejects evidence whose execution started before the durable prediction', async () => {
    const query = vi.fn(async (sql: string) => {
      if (sql.includes('FROM academy_learning_reflections') && sql.includes('FOR UPDATE')) {
        return { rows: [reflectionRow()] };
      }
      if (sql.includes('FROM academy_courses')) return { rows: [{ course_data: course }] };
      if (sql.includes('FROM execution_evidence')) {
        return { rows: [evidenceRow({ execution_started_at: '2026-09-06T04:59:59.000Z' })] };
      }
      throw new Error(`Unexpected SQL: ${sql.slice(0, 100)}`);
    });
    mocks.transaction.mockImplementation(async (handler) => handler({ query }));

    await expect(claimAcademyReflection({
      ownerId,
      reflectionId,
      evidenceId,
      explanation: 'The output reports the active kernel and architecture.',
    })).rejects.toMatchObject({
      code: 'PREDICTION_NOT_BEFORE_EXECUTION',
    } satisfies Partial<AcademyReflectionError>);

    expect(query).not.toHaveBeenCalledWith(expect.stringContaining("SET status='evaluating'"), expect.anything());
  });

  it('claims only exact analyzed Academy terminal evidence', async () => {
    const claimed = reflectionRow({
      status: 'evaluating',
      evidence_id: evidenceId,
      explanation: 'The output reports the active kernel and architecture.',
      evidence_bound_at: '2026-09-06T05:02:00.000Z',
      evaluation_started_at: '2026-09-06T05:02:00.000Z',
    });
    const query = vi.fn(async (sql: string) => {
      if (sql.includes('FROM academy_learning_reflections') && sql.includes('FOR UPDATE')) {
        return { rows: [reflectionRow()] };
      }
      if (sql.includes('FROM academy_courses')) return { rows: [{ course_data: course }] };
      if (sql.includes('FROM execution_evidence')) return { rows: [evidenceRow()] };
      if (sql.includes("SET status='evaluating'")) return { rows: [claimed] };
      throw new Error(`Unexpected SQL: ${sql.slice(0, 100)}`);
    });
    mocks.transaction.mockImplementation(async (handler) => handler({ query }));

    const result = await claimAcademyReflection({
      ownerId,
      reflectionId,
      evidenceId,
      explanation: 'The output reports the active kernel and architecture.',
    });

    expect(result.claim?.evidence).toMatchObject({
      id: evidenceId,
      command: 'uname -a',
      stdout: 'Linux lab 6.8.0 x86_64',
      exitCode: 0,
    });
    expect(query).toHaveBeenCalledWith(
      expect.stringContaining("surface='academy'"),
      [evidenceId, ownerId]
    );
  });

  it('weights understanding by reflection coverage instead of quality alone', async () => {
    const evaluation = {
      score: 80,
      status: 'demonstrated' as const,
      predictionComparison: 'Mostly matched.',
      explanationFeedback: 'Good mechanism explanation.',
      evidenceConnection: 'Connected to the exact output.',
      nextStep: null,
    };
    const evaluating = reflectionRow({
      status: 'evaluating',
      evidence_id: evidenceId,
      explanation: 'The output identifies the kernel and architecture.',
      evidence_bound_at: '2026-09-06T05:02:00.000Z',
      evaluation_started_at: '2026-09-06T05:02:00.000Z',
      course_data: course,
    });
    const reflected = reflectionRow({
      ...evaluating,
      status: 'reflected',
      evaluation,
      explanation_score: 80,
      model: 'test-model',
      reflected_at: '2026-09-06T05:03:00.000Z',
    });
    const query = vi.fn(async (sql: string) => {
      if (sql.includes('JOIN academy_courses') && sql.includes('FOR UPDATE')) {
        return { rows: [evaluating] };
      }
      if (sql.includes("SET status='reflected'")) return { rows: [reflected] };
      if (sql.includes('COUNT(DISTINCT lesson_id)')) {
        return { rows: [{ reflected: 1, average_score: 80 }] };
      }
      if (sql.includes('UPDATE academy_mastery')) return { rows: [] };
      throw new Error(`Unexpected SQL: ${sql.slice(0, 100)}`);
    });
    mocks.transaction.mockImplementation(async (handler) => handler({ query }));

    const result = await completeAcademyReflection({
      ownerId,
      reflectionId,
      evidenceId,
      evaluation,
      model: 'test-model',
    });

    expect(result.understanding).toEqual({
      reflectedPractices: 1,
      requiredPractices: 2,
      averageReflectionScore: 80,
      score: 40,
      status: 'developing',
    });
    expect(query).toHaveBeenCalledWith(
      expect.stringContaining('understanding_score=$2'),
      [1, 40, 'developing', courseId, ownerId]
    );
  });
});
