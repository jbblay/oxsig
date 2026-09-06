import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getActiveControlLease: vi.fn(),
  diagnostics: vi.fn(),
}));

vi.mock('server-only', () => ({}));
vi.mock('@/lib/live-workspace/control', () => ({ getActiveControlLease: mocks.getActiveControlLease }));
vi.mock('@/lib/labs/terminal-observability', () => ({ getLabTerminalDiagnostics: mocks.diagnostics }));
vi.mock('@/lib/live-workspace/server', () => ({
  LiveWorkspaceError: class LiveWorkspaceError extends Error {
    constructor(message: string, readonly status = 409, readonly code = 'LIVE_WORKSPACE_CONFLICT') { super(message); }
  },
}));

import {
  assertLiveWorkspaceTerminalAuthorization,
  prepareLiveWorkspaceTerminal,
} from './terminal';

const workspaceId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const participantId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const bindingId = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const labInstanceId = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
const leaseId = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';
const ownerId = 'ffffffff-ffff-4fff-8fff-ffffffffffff';

const lease = {
  id: leaseId,
  requestId: '11111111-1111-4111-8111-111111111111',
  participantId,
  participantName: 'Learner',
  bindingId,
  labInstanceId,
  labLabel: 'Ubuntu Security Lab',
  surface: 'terminal',
  grantedBy: ownerId,
  status: 'active',
  grantedAt: '2099-01-01T00:00:00.000Z',
  expiresAt: '2099-01-01T00:15:00.000Z',
  revokedAt: null,
  revokedBy: null,
  revocationReason: null,
};

const diagnostics = {
  region: 'eu-central-1',
  instanceId: 'i-0123456789abcdef0',
  ec2State: 'running',
  instanceProfileConfigured: true,
  ssmRegistered: true,
  ssmPingStatus: 'Online',
  ssmAgentVersion: '3.3.1',
  platformType: 'Linux',
  platformName: 'Ubuntu',
  platformVersion: '24.04',
  ready: true,
};

describe('Live Workspace terminal authorization', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getActiveControlLease.mockResolvedValue(lease);
    mocks.diagnostics.mockResolvedValue(diagnostics);
  });

  it('revalidates the exact server-bound lease and current owner-bound attachment before terminal input is accepted', async () => {
    const pool = { query: vi.fn().mockResolvedValue({ rows: [{ '?column?': 1 }], rowCount: 1 }) } as any;
    await expect(assertLiveWorkspaceTerminalAuthorization({
      pool,
      authorization: { collaborationId: workspaceId, participantId, bindingId, labInstanceId, leaseId, surface: 'terminal' },
    })).resolves.toMatchObject({ id: leaseId, participantId, bindingId, labInstanceId });

    expect(mocks.getActiveControlLease).toHaveBeenCalledWith({
      queryable: pool,
      collaborationId: workspaceId,
      participantId,
      bindingId,
      surface: 'terminal',
    });
    expect(pool.query).toHaveBeenCalledWith(expect.stringContaining('resource.resource_owner_id=collaboration.owner_id'), [
      bindingId,
      workspaceId,
      labInstanceId,
    ]);
  });

  it('rejects a stale or substituted lease id even when another lease lookup returns', async () => {
    const pool = { query: vi.fn() } as any;
    await expect(assertLiveWorkspaceTerminalAuthorization({
      pool,
      authorization: {
        collaborationId: workspaceId,
        participantId,
        bindingId,
        labInstanceId,
        leaseId: '22222222-2222-4222-8222-222222222222',
        surface: 'terminal',
      },
    })).rejects.toMatchObject({ code: 'TERMINAL_CONTROL_LEASE_INACTIVE', status: 403 });
    expect(pool.query).not.toHaveBeenCalled();
  });

  it('rejects an already-open shared terminal when current attachment ownership no longer matches the workspace owner', async () => {
    const pool = { query: vi.fn().mockResolvedValue({ rows: [], rowCount: 0 }) } as any;
    await expect(assertLiveWorkspaceTerminalAuthorization({
      pool,
      authorization: { collaborationId: workspaceId, participantId, bindingId, labInstanceId, leaseId, surface: 'terminal' },
    })).rejects.toMatchObject({ code: 'TERMINAL_LAB_AUTHORIZATION_CHANGED', status: 403 });
  });

  it('fails closed before inspecting the lab when the authenticated participant has no active terminal lease', async () => {
    mocks.getActiveControlLease.mockResolvedValue(null);
    const pool = { query: vi.fn() } as any;
    await expect(prepareLiveWorkspaceTerminal({
      pool,
      collaborationId: workspaceId,
      participantId,
      bindingId,
    })).rejects.toMatchObject({ code: 'TERMINAL_CONTROL_LEASE_REQUIRED', status: 403 });
    expect(pool.query).not.toHaveBeenCalled();
    expect(mocks.diagnostics).not.toHaveBeenCalled();
  });

  it('resolves only the exact attached owner-owned terminal lab covered by the lease', async () => {
    const pool = {
      query: vi.fn().mockResolvedValue({ rows: [{
        binding_id: bindingId,
        lab_instance_id: labInstanceId,
        resource_owner_id: ownerId,
        workspace_owner_id: ownerId,
        lab_owner_id: ownerId,
        label: 'Ubuntu Security Lab',
        access_mode: 'terminal',
        status: 'running',
        runtime_provider: 'aws-ec2',
        runtime_external_id: diagnostics.instanceId,
        expires_at: '2099-01-01T01:00:00.000Z',
        last_error: null,
      }] }),
    } as any;

    await expect(prepareLiveWorkspaceTerminal({
      pool,
      collaborationId: workspaceId,
      participantId,
      bindingId,
    })).resolves.toMatchObject({
      runtimeExternalId: diagnostics.instanceId,
      leaseExpiresAt: lease.expiresAt,
      authorization: {
        collaborationId: workspaceId,
        participantId,
        bindingId,
        labInstanceId,
        leaseId,
        surface: 'terminal',
      },
    });
    expect(mocks.diagnostics).toHaveBeenCalledWith(diagnostics.instanceId);
  });
});
