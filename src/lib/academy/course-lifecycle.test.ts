import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getPool: vi.fn(),
  detachOwnerResourceFromLiveWorkspaces: vi.fn(),
}));

vi.mock('server-only', () => ({}));
vi.mock('@/lib/db/pool', () => ({ getPool: mocks.getPool }));
vi.mock('@/lib/live-workspace/resource-lifecycle', () => ({
  detachOwnerResourceFromLiveWorkspaces: mocks.detachOwnerResourceFromLiveWorkspaces,
}));

import {
  activateAcademyCourse,
  archiveAcademyCourse,
  deleteAcademyCourse,
} from './course-lifecycle';
import { PROGRAM_PROCESS_SOURCE_PROMPT } from '@/lib/learning/program-process-path';

const ownerId = '11111111-1111-4111-8111-111111111111';
const courseId = '22222222-2222-4222-8222-222222222222';

describe('Academy course lifecycle alignment', () => {
  const clientQuery = vi.fn();
  const release = vi.fn();
  const connect = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    connect.mockResolvedValue({ query: clientQuery, release });
    mocks.getPool.mockReturnValue({ connect });
    mocks.detachOwnerResourceFromLiveWorkspaces.mockResolvedValue(undefined);
  });

  it('activating the curated reference course activates its enrollment', async () => {
    clientQuery.mockImplementation(async (sql: string) => {
      if (sql.includes('SELECT id, status, source_prompt')) {
        return { rows: [{ id: courseId, status: 'archived', source_prompt: PROGRAM_PROCESS_SOURCE_PROMPT }], rowCount: 1 };
      }
      return { rows: [], rowCount: 1 };
    });

    await expect(activateAcademyCourse(ownerId, courseId)).resolves.toBe(true);

    expect(clientQuery).toHaveBeenCalledWith(
      expect.stringContaining("SET status='active'"),
      expect.arrayContaining([ownerId])
    );
    expect(clientQuery).toHaveBeenCalledWith('COMMIT');
  });

  it('activating a non-reference course abandons an active curated enrollment', async () => {
    clientQuery.mockImplementation(async (sql: string) => {
      if (sql.includes('SELECT id, status, source_prompt')) {
        return { rows: [{ id: courseId, status: 'archived', source_prompt: 'Learn networking' }], rowCount: 1 };
      }
      return { rows: [], rowCount: 1 };
    });

    await expect(activateAcademyCourse(ownerId, courseId)).resolves.toBe(true);

    expect(clientQuery).toHaveBeenCalledWith(
      expect.stringContaining("SET status='abandoned'"),
      expect.arrayContaining([ownerId])
    );
  });

  it('archiving the active Academy course abandons an active curated enrollment', async () => {
    clientQuery.mockImplementation(async (sql: string) => {
      if (sql.includes('SELECT id, status') && !sql.includes('source_prompt')) {
        return { rows: [{ id: courseId, status: 'active' }], rowCount: 1 };
      }
      return { rows: [], rowCount: 1 };
    });

    await expect(archiveAcademyCourse(ownerId, courseId)).resolves.toBe(true);

    expect(clientQuery).toHaveBeenCalledWith(
      expect.stringContaining("SET status='abandoned'"),
      expect.arrayContaining([ownerId])
    );
  });

  it('deleting the active Academy course abandons the journey and detaches workspace bindings', async () => {
    clientQuery.mockImplementation(async (sql: string) => {
      if (sql.includes('SELECT id, status') && !sql.includes('source_prompt')) {
        return { rows: [{ id: courseId, status: 'active' }], rowCount: 1 };
      }
      return { rows: [], rowCount: 1 };
    });

    await expect(deleteAcademyCourse(ownerId, courseId)).resolves.toBe(true);

    expect(mocks.detachOwnerResourceFromLiveWorkspaces).toHaveBeenCalledWith(
      expect.objectContaining({ query: clientQuery }),
      ownerId,
      'academy-course',
      courseId
    );
    expect(clientQuery).toHaveBeenCalledWith(
      expect.stringContaining("SET status='abandoned'"),
      expect.arrayContaining([ownerId])
    );
    expect(clientQuery).toHaveBeenCalledWith('COMMIT');
  });
});
