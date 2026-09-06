import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';

const mocks = vi.hoisted(() => ({
  requireAuth: vi.fn(),
  validateCsrfToken: vi.fn(),
  checkRateLimit: vi.fn(),
  poolQuery: vi.fn(),
  verifyTicket: vi.fn(),
  getAuthorization: vi.fn(),
  getGuestEvidence: vi.fn(),
  getRuntimeEvidence: vi.fn(),
  recordEvidence: vi.fn(),
  getAccessEvidence: vi.fn(),
  buildPayload: vi.fn(),
  buildAccessFacts: vi.fn(),
  buildGuestFacts: vi.fn(),
  buildRuntimeFacts: vi.fn(),
  parseGuestPayload: vi.fn(),
}));

vi.mock('server-only', () => ({}));
vi.mock('@/lib/auth/middleware', () => ({ requireAuth: mocks.requireAuth }));
vi.mock('@/lib/security/csrf', () => ({ validateCsrfToken: mocks.validateCsrfToken }));
vi.mock('@/lib/security/rate-limit', () => ({ checkRateLimit: mocks.checkRateLimit }));
vi.mock('@/lib/db/pool', () => ({ getPool: () => ({ query: mocks.poolQuery }) }));
vi.mock('@/lib/labs/desktop-access-evidence-ticket', () => ({
  verifyDesktopAccessEvidenceTicket: mocks.verifyTicket,
}));
vi.mock('@/lib/infrastructure/deployment-authorization', () => ({
  getDeploymentAuthorizationById: mocks.getAuthorization,
}));
vi.mock('@/lib/execution-evidence/access-path-readiness', () => ({
  AccessPathReadinessEvidenceConflictError: class AccessPathReadinessEvidenceConflictError extends Error {
    constructor(message: string, readonly code: string) { super(message); }
  },
  getAccessPathReadinessEvidence: mocks.getAccessEvidence,
  recordAccessPathReadinessEvidence: mocks.recordEvidence,
}));
vi.mock('@/lib/execution-evidence/guest-service-readiness', () => ({
  getGuestServiceReadinessEvidence: mocks.getGuestEvidence,
}));
vi.mock('@/lib/execution-evidence/runtime-readiness', () => ({
  getRuntimeReadinessEvidence: mocks.getRuntimeEvidence,
}));
vi.mock('@/lib/infrastructure/access-path-readiness-evidence', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/infrastructure/access-path-readiness-evidence')>();
  return {
    ...actual,
    buildAccessPathReadinessFacts: mocks.buildAccessFacts,
    buildAccessPathReadinessPayload: mocks.buildPayload,
  };
});
vi.mock('@/lib/infrastructure/guest-service-readiness-evidence', () => ({
  guestServiceReadinessPayloadSchema: { parse: mocks.parseGuestPayload },
  buildGuestServiceReadinessFacts: mocks.buildGuestFacts,
}));
vi.mock('@/lib/infrastructure/runtime-readiness-evidence', () => ({
  buildRuntimeReadinessFacts: mocks.buildRuntimeFacts,
}));

import { POST } from './route';

const user = { id: 'user-1', role: 'user' as const };
const labId = '11111111-1111-4111-8111-111111111111';
const authorizationId = '22222222-2222-4222-8222-222222222222';
const guestEvidenceId = '33333333-3333-4333-8333-333333333333';
const evidenceExecutionId = '44444444-4444-4444-8444-444444444444';
const context = { params: Promise.resolve({ id: labId }) };
const lab = {
  id: labId,
  runtime_provider: 'aws-ec2',
  runtime_external_id: 'i-0123456789abcdef0',
  expires_at: '2099-09-06T04:00:00.000Z',
  metadata: { accessMode: 'desktop', platform: 'linux' },
};
const ticket = {
  ownerId: user.id,
  labInstanceId: labId,
  deploymentAuthorizationId: authorizationId,
  deploymentExecutionId: '55555555-5555-4555-8555-555555555555',
  planId: 'plan_123',
  planHash: 'a'.repeat(64),
  prerequisiteGuestEvidenceId: guestEvidenceId,
  sessionId: 'session-1',
  target: lab.runtime_external_id,
  platform: 'linux',
  port: 5901,
  evidenceExecutionId,
  nonce: 'nonce',
  iat: Date.now(),
  exp: Date.now() + 120_000,
};
const observation = {
  ssmChannelReady: true,
  rfbHandshakeComplete: true,
  rfbProtocolVersion: 'RFB 003.008',
  desktopName: 'OXSIG Desktop',
  framebuffer: { width: 1440, height: 900 },
};

function request(body = { ticket: 'encrypted-ticket', observation }) {
  return new NextRequest(`http://localhost/api/labs/instances/${labId}/access-path-evidence`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('POST /api/labs/instances/[id]/access-path-evidence', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireAuth.mockImplementation(async (
      req: NextRequest,
      handler: (req: NextRequest, currentUser: typeof user) => Promise<NextResponse>
    ) => handler(req, user));
    mocks.validateCsrfToken.mockResolvedValue(true);
    mocks.checkRateLimit.mockResolvedValue(null);
    mocks.poolQuery.mockResolvedValue({ rows: [lab] });
    mocks.verifyTicket.mockReturnValue(ticket);
    mocks.getAuthorization.mockResolvedValue({ id: authorizationId, state: 'analyzed' });
    mocks.getGuestEvidence.mockResolvedValue({ id: guestEvidenceId, deploymentAuthorizationId: authorizationId });
    mocks.buildPayload.mockReturnValue({
      readiness: {
        guestServiceReady: true,
        ssmSessionIssued: true,
        rfbHandshakeObserved: true,
        browserDesktopPathReady: true,
        state: 'ready',
      },
    });
    mocks.recordEvidence.mockResolvedValue({
      id: '66666666-6666-4666-8666-666666666666',
      executionId: evidenceExecutionId,
      provenance: 'browser-observed',
      state: 'evidence_recorded',
      evidenceRecordedAt: '2026-09-06T03:30:00.000Z',
    });
  });

  it('keeps authentication as the outer boundary', async () => {
    mocks.requireAuth.mockResolvedValue(NextResponse.json({ error: 'Unauthorized' }, { status: 401 }));

    const response = await POST(request(), context);

    expect(response.status).toBe(401);
    expect(mocks.validateCsrfToken).not.toHaveBeenCalled();
  });

  it('rejects an evidence ticket issued for another owner before loading deployment evidence', async () => {
    mocks.verifyTicket.mockReturnValue({ ...ticket, ownerId: 'another-user' });

    const response = await POST(request(), context);
    const body = await response.json();

    expect(response.status).toBe(403);
    expect(body.code).toBe('ACCESS_PATH_TICKET_OWNER_MISMATCH');
    expect(mocks.getAuthorization).not.toHaveBeenCalled();
    expect(mocks.recordEvidence).not.toHaveBeenCalled();
  });

  it('rejects a ticket whose runtime target or private port no longer matches the lab', async () => {
    mocks.verifyTicket.mockReturnValue({ ...ticket, target: 'i-0ffffffffffffffff' });

    const response = await POST(request(), context);
    const body = await response.json();

    expect(response.status).toBe(409);
    expect(body.code).toBe('ACCESS_PATH_TICKET_RUNTIME_MISMATCH');
    expect(mocks.recordEvidence).not.toHaveBeenCalled();
  });

  it('records only the server-bound ticket execution ID and exact guest prerequisite', async () => {
    const response = await POST(request(), context);
    const body = await response.json();

    expect(response.status).toBe(201);
    expect(mocks.getGuestEvidence).toHaveBeenCalledWith({
      ownerId: user.id,
      labInstanceId: labId,
      evidenceId: guestEvidenceId,
    });
    expect(mocks.buildPayload).toHaveBeenCalledWith(expect.objectContaining({
      ticket,
      observation,
    }));
    expect(mocks.recordEvidence).toHaveBeenCalledWith(expect.objectContaining({
      ownerId: user.id,
      labInstanceId: labId,
      deploymentAuthorizationId: authorizationId,
      executionId: evidenceExecutionId,
    }));
    expect(body.evidence.provenance).toBe('browser-observed');
    expect(body.readiness.browserDesktopPathReady).toBe(true);
  });
});
