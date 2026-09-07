import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  poolQuery: vi.fn(),
  clientQuery: vi.fn(),
  connect: vi.fn(),
  release: vi.fn(),
}));

vi.mock('server-only', () => ({}));
vi.mock('@/lib/db/pool', () => ({
  getPool: () => ({ query: mocks.poolQuery, connect: mocks.connect }),
}));

import {
  createAcademyCourse,
  recordAcademyPractice,
  recordAcademyQuestion,
} from './persistence';

const ownerId = '11111111-1111-4111-8111-111111111111';
const courseId = '22222222-2222-4222-8222-222222222222';
const course = {
  title: 'Course',
  topic: 'Processes',
  level: 'intermediate',
  overview: 'Overview',
  estimatedMinutes: 10,
  objectives: ['Objective'],
  prerequisites: [],
  lessons: [{
    id: 'process-context',
    title: 'Process context',
    summary: 'Summary',
    explanation: 'Explanation',
    keyPoints: ['Point'],
    visual: { title: 'Visual', nodes: ['Node'] },
    practice: {
      title: 'Environment',
      instruction: 'Inspect',
      command: `tr '\u0000' '\n'`,
      expected: 'Expected',
      labRequired: true,
    },
    checkpoint: 'Explain',
  }],
} as never;

describe('Academy persistence PostgreSQL safety', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.connect.mockResolvedValue({ query: mocks.clientQuery, release: mocks.release });
    mocks.clientQuery.mockImplementation(async (sql: string) => (
      sql.includes('INSERT INTO academy_courses') ? { rows: [{ id: courseId }] } : { rows: [] }
    ));
  });

  it('sanitizes course text and nested JSON at the database boundary', async () => {
    await createAcademyCourse(ownerId, `prompt\u0000value`, course);

    const insert = mocks.clientQuery.mock.calls.find(([sql]) => String(sql).includes('INSERT INTO academy_courses'));
    expect(insert).toBeTruthy();
    const params = insert?.[1] as unknown[];
    expect(String(params[1])).toBe('prompt\\0value');
    expect(String(params[2])).not.toContain('\\u0000');
    expect(JSON.parse(String(params[2])).lessons[0].practice.command).toBe("tr '\\0' '\n'");
  });

  it('sanitizes question text and answer JSON', async () => {
    mocks.poolQuery.mockImplementation(async (sql: string) => {
      if (sql.includes('FROM academy_courses')) return { rows: [{ id: courseId, course_data: course }] };
      return { rows: [] };
    });

    await recordAcademyQuestion({
      ownerId,
      courseTitle: 'Course',
      lessonTitle: 'Process context',
      question: `what\u0000now`,
      answer: { answer: `because\u0000reason` } as never,
    });

    const insert = mocks.poolQuery.mock.calls.find(([sql]) => String(sql).includes('INSERT INTO academy_questions'));
    const params = insert?.[1] as unknown[];
    expect(params[3]).toBe('what\\0now');
    expect(String(params[4])).not.toContain('\\u0000');
  });

  it('sanitizes practice command, output, stderr, and evaluation JSON', async () => {
    mocks.poolQuery.mockImplementation(async (sql: string) => {
      if (sql.includes('FROM academy_courses')) return { rows: [{ id: courseId, course_data: course }] };
      if (sql.includes('SELECT completed_lesson_ids')) return { rows: [{ completed_lesson_ids: [] }] };
      if (sql.includes('COUNT(DISTINCT lesson_id)')) return { rows: [{ passed: 0 }] };
      return { rows: [] };
    });

    await recordAcademyPractice({
      ownerId,
      courseTitle: 'Course',
      lessonTitle: 'Process context',
      command: `cmd\u0000arg`,
      stdout: `out\u0000put`,
      stderr: `err\u0000or`,
      exitCode: 0,
      evaluation: { status: 'passed', feedback: `ok\u0000done` } as never,
    });

    const insert = mocks.poolQuery.mock.calls.find(([sql]) => String(sql).includes('INSERT INTO academy_practice_attempts'));
    const params = insert?.[1] as unknown[];
    expect(params[4]).toBe('cmd\\0arg');
    expect(params[5]).toBe('out\\0put');
    expect(params[6]).toBe('err\\0or');
    expect(String(params[8])).not.toContain('\\u0000');
  });
});
