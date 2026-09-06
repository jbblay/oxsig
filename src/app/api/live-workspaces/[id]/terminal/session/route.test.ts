import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';

const mocks = vi.hoisted(() => ({
  requireAuth: vi.fn(),
  validateCsrfToken: vi.fn(),
  checkRateLimit: vi.fn(),
  getPool: vi.fn(),
  prepareTerminal: vi.fn(),
  assertAuthorization: vi.fn(),
  startSession: vi.fn(),
  terminateSession: vi.fn(),
  createTicket: vi.fn(),
  ticketTtl: vi.fn(),
  logAudit: vi.fn(),
  requestMetadata: vi.fn(),
}));

vi.mock('@/lib/auth/middleware', () => ({ requireAuth: mocks.requireAuth }));
vi.mock('@/lib/security/csrf', () => ({ validateCsrfToken: mocks.validateCsrfToken }));
vi.mock('@/lib/security/rate-limit', () => ({ checkRateLimit: mocks.checkRateLimit }));
vi.mock('@/lib/db/pool', () => ({ getPool: mocks.getPool }));
vi.mock('@/lib/live-workspace/terminal', () => ({
  prepareLiveWorkspaceTerminal: mocks.prepareTerminal,
  assertLiveWorkspaceTerminalAuthorization: mocks.assertAuthorization,
}));
vi.mock('@/lib/labs/aws-runtime', () => ({
  startInteractiveLabSession: mocks.startSession,
  terminateInteractiveLabSession: mocks.terminateSession,
}));
vi.mock('@/lib/labs/terminal-bridge-ticket.js', () => ({
  createTerminalBridgeTicket: mocks.createTicket,
  terminalBridgeTicketTtlMs: mocks.ticketTtl,
}));
vi.mock('@/lib/audit/logger', () => ({
  AUDIT_ACTIONS: {
    LAB_SESSION_START: 'lab.session.start',
    LAB_SESSION_START_FAILED: 'lab.session.start.failed',
    LAB_SESSION_END: 'lab.session.end',
  },
  getRequestMetadata: mocks.requestMetadata,
  logAudit: mocks.logAudit,
}));
vi.mock('@/lib/live-workspace/server', () => ({
  LiveWorkspaceError: class LiveWorkspaceError extends Error {
    constructor(message: string, readonly status = 409, readonly code = 'LIVE_WORKSPACE_CONFLICT') { super(message); }
  },
}));

import { LiveWorkspaceError } from '@/lib/live-workspace/server';
import { POST } from './route';

const workspaceId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const participantId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const bindingId = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const labInstanceId = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
const leaseId = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';
const user = { id: participantId, clerkUserId: 'clerk-1', role: 'user' as const };
const pool = { query: vi.fn() };
const runtimeExternalId = 'i-0123456789abcdef0';

const authorization = {
  collaborationId: workspaceId,
  participantId,
  bindingId,
  labInstanceId,
  leaseId,
  surface: 'terminal' as const,
};

function request(body: unknown) {
  return new NextRequest(`http://localhost/api/live-workspaces/${workspaceId}/terminal/session`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('Live Workspace shared terminal session API', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireAuth.mockImplementation(async (
      req: NextRequest,
      handler: (req: NextRequest, currentUser: typeof user) => Promise<NextResponse>
    ) => handler(req, user));
    mocks.validateCsrfToken.mockResolvedValue(true);
    mocks.checkRateLimit.mockResolvedValue(null);
    mocks.getPool.mockReturnValue(pool);
    mocks.prepareTerminal.mockResolvedValue({
      authorization,
      label: 'Ubuntu Security Lab',
      runtimeExternalId,
      diagnostics: { ec2State: 'running', ssmRegistered: true, ssmPingStatus: 'Online' },
      leaseExpiresAt: '2099-01-01T00:15:00.000Z',
    });
    mocks.startSession.mockResolvedValue({
      sessionId: 'session-shared-1',
      streamUrl: 'wss://ssmmessages.eu-central-1.amazonaws.com/v1/data-channel/session-shared-1?role=publish_subscribe',
      tokenValue: 'ssm-token',
      region: 'eu-central-1',
    });
    mocks.terminateSession.mockResolvedValue({ terminated: true, alreadyEnded: false });
    mocks.createTicket.mockReturnValue('encrypted-bridge-ticket');
    mocks.ticketTtl.mockReturnValue(30_000);
    mocks.requestMetadata.mockReturnValue({ ipAddress: '127.0.0.1', userAgent: 'vitest' });
    mocks.logAudit.mockResolvedValue(undefined);
  });

  it('derives the terminal participant from authentication and the lease service', async () => {
    const response = await POST(request({ bindingId }), { params: Promise.resolve({ id: workspaceId }) });
    expect(response.status).toBe(200);
    expect(mocks.prepareTerminal).toHaveBeenCalledWith({
      pool,
      collaborationId: workspaceId,
      participantId,
      bindingId,
    });
    expect(mocks.createTicket).toHaveBeenCalledWith(expect.objectContaining({
      target: runtimeExternalId,
      workspaceControl: authorization,
    }));
    const body = await response.json();
    expect(body).toMatchObject({
      sessionId: 'session-shared-1',
      leaseId,
      labInstanceId,
      bindingId,
    });
    expect(body.bridgePath).toContain('encrypted-bridge-ticket');
    expect(body).not.toHaveProperty('streamUrl');
  });

  it('rejects browser-supplied authorization principals and never starts AWS', async () => {
    const response = await POST(request({
      bindingId,
      participantId: 'ffffffff-ffff-4fff-8fff-ffffffffffff',
      leaseId,
    }), { params: Promise.resolve({ id: workspaceId }) });
    expect(response.status).toBe(400);
    expect(mocks.prepareTerminal).not.toHaveBeenCalled();
    expect(mocks.startSession).not.toHaveBeenCalled();
  });

  it('fails closed when the authenticated participant no longer holds a terminal lease', async () => {
    mocks.prepareTerminal.mockRejectedValue(new LiveWorkspaceError(
      'An active terminal control lease is required before opening shared terminal input.',
      403,
      'TERMINAL_CONTROL_LEASE_REQUIRED'
    ));
    const response = await POST(request({ bindingId }), { params: Promise.resolve({ id: workspaceId }) });
    expect(response.status).toBe(403);
    expect(await response.json()).toMatchObject({ code: 'TERMINAL_CONTROL_LEASE_REQUIRED' });
    expect(mocks.startSession).not.toHaveBeenCalled();
    expect(mocks.createTicket).not.toHaveBeenCalled();
  });

  it('terminates a partially started SSM session when ticket minting fails', async () => {
    mocks.createTicket.mockImplementation(() => { throw new Error('ticket mint failed'); });
    const response = await POST(request({ bindingId }), { params: Promise.resolve({ id: workspaceId }) });
    expect(response.status).toBe(503);
    expect(mocks.startSession).toHaveBeenCalledTimes(1);
    expect(mocks.terminateSession).toHaveBeenCalledWith(runtimeExternalId, 'session-shared-1');
    expect(await response.json()).toMatchObject({ code: 'SHARED_TERMINAL_SESSION_START_FAILED' });
  });
});
