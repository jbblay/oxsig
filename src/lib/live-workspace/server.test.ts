import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

import {
  assignLiveWorkspaceRole,
  assertOwnerResource,
  capabilitiesForLiveWorkspaceRole,
  getLiveWorkspaceAccess,
  listOwnerAttachableResources,
  LiveWorkspaceError,
} from './server';

function poolWith(handler: (sql: string, values?: unknown[]) => any) {
  return { query: vi.fn((sql: string, values?: unknown[]) => handler(sql, values)) } as any;
}

describe('Live Workspace foundation policy', () => {
  beforeEach(() => vi.clearAllMocks());

  it('keeps observer membership read-only and ineligible for shared control', () => {
    expect(capabilitiesForLiveWorkspaceRole('observer')).toEqual({
      observe: true,
      collaborate: false,
      requestControl: false,
      grantControl: false,
      manageParticipants: false,
      manageResources: false,
      eligibleForTerminalControl: false,
      eligibleForDesktopControl: false,
    });
  });

  it('lets learners request future control without granting or managing it', () => {
    const capabilities = capabilitiesForLiveWorkspaceRole('learner');
    expect(capabilities).toMatchObject({
      observe: true,
      collaborate: true,
      requestControl: true,
      grantControl: false,
      manageParticipants: false,
      manageResources: false,
      eligibleForTerminalControl: true,
      eligibleForDesktopControl: true,
    });
  });

  it('lets instructors manage participants but not attach owner resources', () => {
    expect(capabilitiesForLiveWorkspaceRole('instructor')).toMatchObject({
      manageParticipants: true,
      manageResources: false,
      grantControl: true,
    });
  });

  it('defaults a generic active collaboration member to observer when no live role exists', async () => {
    const pool = poolWith(() => ({ rows: [{
      id: 'workspace-1',
      name: 'Lab class',
      description: '',
      owner_id: 'owner-1',
      is_owner: false,
      live_role: null,
    }] }));

    const access = await getLiveWorkspaceAccess(pool, 'workspace-1', 'member-1');
    expect(access?.role).toBe('observer');
    expect(access?.capabilities.eligibleForTerminalControl).toBe(false);
  });

  it('does not allow a participant manager to change the immutable owner role', async () => {
    const pool = poolWith((sql) => {
      if (sql.includes('FROM collaborations c')) return { rows: [{
        id: 'workspace-1', name: 'Lab class', description: '', owner_id: 'owner-1', is_owner: true, live_role: 'owner',
      }] };
      return { rows: [], rowCount: 0 };
    });

    await expect(assignLiveWorkspaceRole({
      pool,
      collaborationId: 'workspace-1',
      actorId: 'owner-1',
      targetUserId: 'owner-1',
      role: 'learner',
    })).rejects.toMatchObject({ code: 'OWNER_ROLE_IMMUTABLE' });
  });

  it('prevents instructors from creating another instructor', async () => {
    const pool = poolWith((sql) => {
      if (sql.includes('FROM collaborations c')) return { rows: [{
        id: 'workspace-1', name: 'Lab class', description: '', owner_id: 'owner-1', is_owner: false, live_role: 'instructor',
      }] };
      return { rows: [{ '?column?': 1 }], rowCount: 1 };
    });
    await expect(assignLiveWorkspaceRole({
      pool,
      collaborationId: 'workspace-1',
      actorId: 'instructor-1',
      targetUserId: 'member-2',
      role: 'instructor',
    })).rejects.toMatchObject({ code: 'INSTRUCTOR_ASSIGNMENT_DENIED', status: 403 });
  });

  it('discovers only owner-scoped resources and preserves their control surface', async () => {
    const pool = poolWith((_sql, values) => {
      expect(values).toEqual(['owner-1']);
      return { rows: [
        { id: 'lab-1', type: 'lab-instance', label: 'Ubuntu Lab', access_mode: 'terminal' },
        { id: 'course-1', type: 'academy-course', label: 'Linux networking', access_mode: null },
        { id: 'owner-1', type: 'infrastructure-design', label: 'Infrastructure design', access_mode: null },
        { id: 'board-1', type: 'storyboard', label: 'Process model', access_mode: null },
        { id: 'vault-1', type: 'vault-item', label: 'fork notes', access_mode: null },
      ] };
    });

    await expect(listOwnerAttachableResources(pool, 'owner-1')).resolves.toEqual([
      { id: 'lab-1', type: 'lab-instance', label: 'Ubuntu Lab', accessMode: 'terminal' },
      { id: 'course-1', type: 'academy-course', label: 'Linux networking', accessMode: null },
      { id: 'owner-1', type: 'infrastructure-design', label: 'Infrastructure design', accessMode: null },
      { id: 'board-1', type: 'storyboard', label: 'Process model', accessMode: null },
      { id: 'vault-1', type: 'vault-item', label: 'fork notes', accessMode: null },
    ]);
  });

  it('rejects foreign lab resources instead of attaching them to the workspace owner', async () => {
    const pool = poolWith(() => ({ rows: [], rowCount: 0 }));
    await expect(assertOwnerResource(pool, 'owner-1', 'lab-instance', 'lab-foreign'))
      .rejects.toMatchObject({ code: 'RESOURCE_OWNERSHIP_MISMATCH', status: 403 });
  });

  it('returns the owner-owned resource without changing its identity', async () => {
    const pool = poolWith((sql, values) => {
      expect(values).toEqual(['lab-1', 'owner-1']);
      if (sql.includes('FROM lab_instances')) return { rows: [{ id: 'lab-1', label: 'Ubuntu Lab' }], rowCount: 1 };
      return { rows: [], rowCount: 0 };
    });
    await expect(assertOwnerResource(pool, 'owner-1', 'lab-instance', 'lab-1'))
      .resolves.toEqual({ id: 'lab-1', label: 'Ubuntu Lab' });
  });

  it('owner-scopes Boards and Vault items before exposing them in a Workspace', async () => {
    const boardPool = poolWith((sql, values) => {
      expect(values).toEqual(['board-1', 'owner-1']);
      expect(sql).toContain('storyboard_sessions');
      return { rows: [{ id: 'board-1', label: 'Process model' }], rowCount: 1 };
    });
    await expect(assertOwnerResource(boardPool, 'owner-1', 'storyboard', 'board-1'))
      .resolves.toEqual({ id: 'board-1', label: 'Process model' });

    const vaultPool = poolWith((sql, values) => {
      expect(values).toEqual(['vault-1', 'owner-1']);
      expect(sql).toContain('vault_items');
      return { rows: [{ id: 'vault-1', label: 'fork notes' }], rowCount: 1 };
    });
    await expect(assertOwnerResource(vaultPool, 'owner-1', 'vault-item', 'vault-1'))
      .resolves.toEqual({ id: 'vault-1', label: 'fork notes' });
  });

  it('rejects a foreign Board or Vault item', async () => {
    const pool = poolWith(() => ({ rows: [], rowCount: 0 }));
    await expect(assertOwnerResource(pool, 'owner-1', 'storyboard', 'foreign-board'))
      .rejects.toMatchObject({ code: 'RESOURCE_OWNERSHIP_MISMATCH', status: 403 });
    await expect(assertOwnerResource(pool, 'owner-1', 'vault-item', 'foreign-vault'))
      .rejects.toMatchObject({ code: 'RESOURCE_OWNERSHIP_MISMATCH', status: 403 });
  });

  it('uses typed conflict errors for denied operations', () => {
    const error = new LiveWorkspaceError('denied', 403, 'DENIED');
    expect(error).toMatchObject({ status: 403, code: 'DENIED' });
  });
});