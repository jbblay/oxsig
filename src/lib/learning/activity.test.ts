import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ query: vi.fn() }));

vi.mock('server-only', () => ({}));
vi.mock('@/lib/db/pool', () => ({ getPool: () => ({ query: mocks.query }) }));

import { recordLearningActivity } from './activity';

describe('recordLearningActivity', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.query.mockResolvedValue({ rows: [] });
  });

  it('increments only the Academy counter for Academy activity', async () => {
    await expect(recordLearningActivity('user-1', 'academy')).resolves.toBe(true);

    expect(mocks.query).toHaveBeenCalledWith(expect.stringContaining('learning_activity_days'), ['user-1', 1, 0]);
  });

  it('increments only the lab counter for lab activity', async () => {
    await expect(recordLearningActivity('user-1', 'lab')).resolves.toBe(true);

    expect(mocks.query).toHaveBeenCalledWith(expect.stringContaining('learning_activity_days'), ['user-1', 0, 1]);
  });

  it('fails open when the analytics table is not available', async () => {
    const error = new Error('relation missing') as Error & { code: string };
    error.code = '42P01';
    mocks.query.mockRejectedValue(error);
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    await expect(recordLearningActivity('user-1', 'academy')).resolves.toBe(false);
    expect(consoleSpy).toHaveBeenCalledWith('Learning activity rollup could not be recorded', { kind: 'academy', code: '42P01' });

    consoleSpy.mockRestore();
  });
});
