import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { CuratedLearningPath } from './curated-paths';

const mocks = vi.hoisted(() => ({
  getPool: vi.fn(),
}));

vi.mock('server-only', () => ({}));
vi.mock('@/lib/db/pool', () => ({ getPool: mocks.getPool }));

const path: CuratedLearningPath = {
  id: 'test-path',
  version: 1,
  title: 'Test path',
  description: 'Test',
  sourcePrompt: 'test:path@1',
  capabilities: [
    { id: 'one', title: 'One', outcome: 'One', evidence: 'One', practiceLabel: 'One' },
    { id: 'two', title: 'Two', outcome: 'Two', evidence: 'Two', practiceLabel: 'Two' },
  ],
  buildCourse: () => ({}) as never,
};

describe('curated path enrollment reconciliation', () => {
  beforeEach(() => vi.clearAllMocks());

  it('moves the durable active pointer to the first capability not yet demonstrated', async () => {
    const query = vi.fn()
      .mockResolvedValueOnce({ rows: [{ id: 'enrollment-1', active_capability_id: 'one' }] })
      .mockResolvedValueOnce({ rows: [
        { capability_id: 'one', source_type: 'academy-practice', result: 'demonstrated' },
        { capability_id: 'one', source_type: 'academy-reflection', result: 'demonstrated' },
      ] })
      .mockResolvedValueOnce({ rows: [], rowCount: 1 });
    mocks.getPool.mockReturnValue({ query });

    const { reconcileCuratedPathEnrollment } = await import('./curated-progression');
    const progress = await reconcileCuratedPathEnrollment('owner-1', path);

    expect(progress).toMatchObject({ nextCapabilityId: 'two', completed: false });
    expect(query).toHaveBeenNthCalledWith(
      3,
      expect.stringContaining('SET active_capability_id=$1'),
      ['two', true, 'enrollment-1', 'owner-1'],
    );
  });

  it('marks the enrollment completed when every capability is proved', async () => {
    const query = vi.fn()
      .mockResolvedValueOnce({ rows: [{ id: 'enrollment-1', active_capability_id: 'two' }] })
      .mockResolvedValueOnce({ rows: [
        { capability_id: 'one', source_type: 'assessment', result: 'demonstrated' },
        { capability_id: 'two', source_type: 'academy-practice', result: 'demonstrated' },
        { capability_id: 'two', source_type: 'academy-reflection', result: 'demonstrated' },
      ] })
      .mockResolvedValueOnce({ rows: [], rowCount: 1 });
    mocks.getPool.mockReturnValue({ query });

    const { reconcileCuratedPathEnrollment } = await import('./curated-progression');
    const progress = await reconcileCuratedPathEnrollment('owner-1', path);

    expect(progress).toMatchObject({ nextCapabilityId: null, completed: true });
    expect(query).toHaveBeenNthCalledWith(
      3,
      expect.stringContaining("SET status='completed'"),
      ['enrollment-1', 'owner-1'],
    );
  });

  it('does not mutate an already-correct pointer during read-side self-healing', async () => {
    const query = vi.fn()
      .mockResolvedValueOnce({ rows: [{ id: 'enrollment-1', active_capability_id: 'one' }] })
      .mockResolvedValueOnce({ rows: [] });
    mocks.getPool.mockReturnValue({ query });

    const { reconcileCuratedPathEnrollment } = await import('./curated-progression');
    const progress = await reconcileCuratedPathEnrollment('owner-1', path, { touchActivity: false });

    expect(progress).toMatchObject({ nextCapabilityId: 'one', completed: false });
    expect(query).toHaveBeenCalledTimes(2);
  });
});
