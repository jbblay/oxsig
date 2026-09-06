import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';

const mocks = vi.hoisted(() => ({
  requireAuth: vi.fn(),
  validateCsrfToken: vi.fn(),
  checkRateLimit: vi.fn(),
  poolQuery: vi.fn(),
  diagnostics: vi.fn(),
  ensureDesktopRuntime: vi.fn(),
  inspectDesktopService: vi.fn(),
  startDesktopPortSession: vi.fn(),
  terminateInteractiveLabSession: vi.fn(),
  createTicket: vi.fn(),
  ticketTtl: vi.fn(),
  logAudit: vi.fn(),
  requestMetadata: vi.fn(),
}));

vi.mock('@/lib/auth/middleware', () => ({ requireAuth: mocks.requireAuth }));
vi.mock('@/lib/security/csrf', () => ({ validateCsrfToken: mocks.validateCsrfToken }));
vi.mock('@/lib/security/rate-limit', () => ({ checkRateLimit: mocks.checkRateLimit }));
vi.mock('@/lib/db/pool', () => ({ getPool: () => ({ query: mocks.poolQuery }) }));
vi.mock('@/lib/labs/desktop-runtime', () => ({
  ensureDesktopRuntime: mocks.ensureDesktopRuntime,
  inspectDesktopService: mocks.inspectDesktopService,
  startDesktopPortSession: mocks.startDesktopPortSession,
}));
vi.mock('@/lib/labs/aws-runtime', () => ({
  terminateInteractiveLabSession: mocks.terminateInteractiveLabSession,
}));
vi.mock('@/lib/labs/terminal-bridge-ticket.js', () => ({
  createTerminalBridgeTicket: mocks.createTicket,
  terminalBridgeTicketTtlMs: mocks.ticketTtl,
}));
vi.mock('@/lib/labs/terminal-observability', () => ({
  getLabTerminalDiagnostics: mocks.diagnostics,
}));
vi.mock('@/lib/audit/logger', () => ({
  AUDIT_ACTIONS: { LAB_SESSION_START: 'lab.session.start', LAB_SESSION_END: 'lab.session.end' },
  getRequestMetadata: mocks.requestMetadata,
  logAudit: mocks.logAudit,
}));

import { POST } from './route';

const user = { id: 'user-1', role: 'user' as const };
const labId = '11111111-1111-4111-8111-111111111111';
const context = { params: Promise.resolve({ id: labId }) };
const lab = {
  id: labId,
  status: 'running',
  runtime_provider: 'aws-ec2',
  runtime_external_id: 'i-0123456789abcdef0',
  expires_at: '2099-09-06T04:00:00.000Z',
  metadata: { accessMode: 'desktop', platform: 'linux' },
};
const diagnostics = {
  region: 'eu-central-1',
  instanceId: lab.runtime_external_id,
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

function request() {
  return new NextRequest(`http://localhost/api/labs/instances/${labId}/desktop/session`, { method: 'POST' });
}

describe('POST /api/labs/instances/[id]/desktop/session', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireAuth.mockImplementation(async (
      req: NextRequest,
      handler: (req: NextRequest, currentUser: typeof user) => Promise<NextResponse>
    ) => handler(req, user));
    mocks.validateCsrfToken.mockResolvedValue(true);
    mocks.checkRateLimit.mockResolvedValue(null);
    mocks.poolQuery.mockResolvedValue({ rows: [lab] });
    mocks.diagnostics.mockResolvedValue(diagnostics);
    mocks.ensureDesktopRuntime.mockResolvedValue({ ready: true, bootstrapStarted: false });
    mocks.inspectDesktopService.mockResolvedValue({ ready: true });
    mocks.startDesktopPortSession.mockResolvedValue({
      sessionId: 'session-1',
      streamUrl: 'wss://example.test/session',
      tokenValue: 'token',
      region: 'eu-central-1',
      port: 5901,
    });
    mocks.createTicket.mockReturnValue('bridge-ticket');
    mocks.ticketTtl.mockReturnValue(60_000);
    mocks.requestMetadata.mockReturnValue({ userAgent: 'vitest' });
    mocks.logAudit.mockResolvedValue(undefined);
  });

  it('does not start a port-forwarding session when the guest listener is not ready', async () => {
    mocks.inspectDesktopService.mockResolvedValue({ ready: false });

    const response = await POST(request(), context);
    const body = await response.json();

    expect(response.status).toBe(425);
    expect(body.code).toBe('DESKTOP_SERVICE_NOT_READY');
    expect(body.stage).toBe('desktop-service');
    expect(mocks.inspectDesktopService).toHaveBeenCalledWith(lab.runtime_external_id, 'linux');
    expect(mocks.startDesktopPortSession).not.toHaveBeenCalled();
  });

  it('starts the private desktop tunnel only after the guest service inspection is ready', async () => {
    const response = await POST(request(), context);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(mocks.inspectDesktopService).toHaveBeenCalledWith(lab.runtime_external_id, 'linux');
    expect(mocks.startDesktopPortSession).toHaveBeenCalledWith(lab.runtime_external_id, 'linux');
    expect(body).toMatchObject({ sessionId: 'session-1', port: 5901, platform: 'linux' });
  });
});
