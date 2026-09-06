import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';

const mocks = vi.hoisted(() => ({
  requireAuth: vi.fn(),
  validateCsrfToken: vi.fn(),
  checkRateLimit: vi.fn(),
  poolQuery: vi.fn(),
  getAuthorization: vi.fn(),
  getRuntimeEvidence: vi.fn(),
  buildRuntimeFacts: vi.fn(),
  inspectDesktopService: vi.fn(),
  buildPayload: vi.fn(),
  recordEvidence: vi.fn(),
  buildFacts: vi.fn(),
}));

vi.mock('@/lib/auth/middleware', () => ({ requireAuth: mocks.requireAuth }));
vi.mock('@/lib/security/csrf', () => ({ validateCsrfToken: mocks.validateCsrfToken }));
vi.mock('@/lib/security/rate-limit', () => ({ checkRateLimit: mocks.checkRateLimit }));
vi.mock('@/lib/db/pool', () => ({ getPool: () => ({ query: mocks.poolQuery }) }));
vi.mock('@/lib/infrastructure/deployment-authorization', () => ({
  getDeploymentAuthorizationById: mocks.getAuthorization,
}));
vi.mock('@/lib/execution-evidence/runtime-readiness', () => ({
  getRuntimeReadinessEvidence: mocks.getRuntimeEvidence,
  RuntimeReadinessEvidenceConflictError: class RuntimeReadinessEvidenceConflictError extends Error {
    constructor(message: string, readonly code: string) { super(message); }
  },
}));
vi.mock('@/lib/infrastructure/runtime-readiness-evidence', () => ({
  buildRuntimeReadinessFacts: mocks.buildRuntimeFacts,
  RuntimeReadinessInterpretationError: class RuntimeReadinessInterpretationError extends Error {
    constructor(message: string, readonly code: string) { super(message); }
  },
}));
vi.mock('@/lib/labs/desktop-runtime', () => ({
  inspectDesktopService: mocks.inspectDesktopService,
}));
vi.mock('@/lib/execution-evidence/guest-service-readiness', () => ({
  recordGuestServiceReadinessEvidence: mocks.recordEvidence,
}));
vi.mock('@/lib/infrastructure/guest-service-readiness-evidence', () => ({
  buildGuestServiceReadinessPayload: mocks.buildPayload,
  buildGuestServiceReadinessFacts: mocks.buildFacts,
  GuestServiceReadinessInterpretationError: class GuestServiceReadinessInterpretationError extends Error {
    constructor(message: string, readonly code: string) { super(message); }
  },
}));

import { POST } from './route';

const user = { id: 'user-1', role: 'user' as const };
const labId = '11111111-1111-4111-8111-111111111111';
const authorizationId = '22222222-2222-4222-8222-222222222222';

function request() {
  return new NextRequest(`http://localhost/api/labs/instances/${labId}/guest-service-evidence`, { method: 'POST' });
}

const context = { params: Promise.resolve({ id: labId }) };
const lab = {
  id: labId,
  runtime_provider: 'aws-ec2',
  runtime_external_id: 'i-0123456789abcdef0',
  expires_at: '2099-09-06T02:00:00.000Z',
  metadata: { accessMode: 'desktop', platform: 'linux' },
};
const authorization = {
  id: authorizationId,
  ownerId: user.id,
  planId: 'plan_123',
  planHash: 'a'.repeat(64),
  state: 'analyzed',
};
const runtimeEvidence = { id: '33333333-3333-4333-8333-333333333333' };
const runtimeFacts = {
  evidenceId: runtimeEvidence.id,
  readiness: { managementReady: true },
  target: { accessMode: 'desktop' },
};
const inspection = {
  platform: 'linux',
  serviceName: 'oxsig-desktop-vnc.service',
  expectedPort: 5901,
  serviceInstalled: true,
  serviceState: 'active',
  serviceRunning: true,
  readyMarkerPresent: true,
  listenerPresent: true,
  listenerAddress: '127.0.0.1:5901',
  loopbackOnly: true,
  ready: true,
  exitCode: 0,
};
const payload = { version: 1, readiness: { state: 'ready' } };
const evidence = {
  id: '44444444-4444-4444-8444-444444444444',
  executionId: '55555555-5555-4555-8555-555555555555',
  provenance: 'server-executed',
  state: 'evidence_recorded',
  evidenceRecordedAt: '2026-09-06T03:00:00.000Z',
};
const facts = { provenance: 'server-executed', readiness: { state: 'ready' } };

describe('POST /api/labs/instances/[id]/guest-service-evidence', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireAuth.mockImplementation(async (
      req: NextRequest,
      handler: (req: NextRequest, currentUser: typeof user) => Promise<NextResponse>
    ) => handler(req, user));
    mocks.validateCsrfToken.mockResolvedValue(true);
    mocks.checkRateLimit.mockResolvedValue(null);
    mocks.poolQuery.mockImplementation(async (sql: string) => {
      if (sql.includes('FROM lab_instances')) return { rows: [lab] };
      if (sql.includes('FROM deployment_authorizations')) return { rows: [{ id: authorizationId }] };
      throw new Error(`Unexpected SQL: ${sql.slice(0, 100)}`);
    });
    mocks.getAuthorization.mockResolvedValue(authorization);
    mocks.getRuntimeEvidence.mockResolvedValue(runtimeEvidence);
    mocks.buildRuntimeFacts.mockReturnValue(runtimeFacts);
    mocks.inspectDesktopService.mockResolvedValue(inspection);
    mocks.buildPayload.mockReturnValue(payload);
    mocks.recordEvidence.mockResolvedValue(evidence);
    mocks.buildFacts.mockReturnValue(facts);
  });

  it('keeps authentication as the outer boundary', async () => {
    mocks.requireAuth.mockResolvedValue(NextResponse.json({ error: 'Unauthorized' }, { status: 401 }));

    const response = await POST(request(), context);

    expect(response.status).toBe(401);
    expect(mocks.validateCsrfToken).not.toHaveBeenCalled();
    expect(mocks.poolQuery).not.toHaveBeenCalled();
  });

  it('checks CSRF before loading lab or guest state', async () => {
    mocks.validateCsrfToken.mockResolvedValue(false);

    const response = await POST(request(), context);

    expect(response.status).toBe(403);
    expect(mocks.poolQuery).not.toHaveBeenCalled();
    expect(mocks.inspectDesktopService).not.toHaveBeenCalled();
  });

  it('refuses guest desktop evidence for a terminal-only lab', async () => {
    mocks.poolQuery.mockResolvedValueOnce({ rows: [{ ...lab, metadata: { accessMode: 'terminal', platform: 'linux' } }] });

    const response = await POST(request(), context);
    const body = await response.json();

    expect(response.status).toBe(409);
    expect(body.code).toBe('GUEST_SERVICE_NOT_APPLICABLE');
    expect(mocks.getRuntimeEvidence).not.toHaveBeenCalled();
    expect(mocks.inspectDesktopService).not.toHaveBeenCalled();
  });

  it('requires prior management-ready evidence before executing the guest inspection', async () => {
    mocks.buildRuntimeFacts.mockReturnValue({ ...runtimeFacts, readiness: { managementReady: false } });

    const response = await POST(request(), context);
    const body = await response.json();

    expect(response.status).toBe(409);
    expect(body.code).toBe('GUEST_SERVICE_MANAGEMENT_NOT_READY');
    expect(mocks.inspectDesktopService).not.toHaveBeenCalled();
  });

  it('captures a fixed server-executed guest inspection and persists it before analysis', async () => {
    const response = await POST(request(), context);
    const body = await response.json();

    expect(response.status).toBe(201);
    expect(response.headers.get('cache-control')).toContain('no-store');
    expect(mocks.inspectDesktopService).toHaveBeenCalledWith(lab.runtime_external_id, 'linux');
    expect(mocks.buildPayload).toHaveBeenCalledWith({ authorization, runtimeFacts, inspection });
    expect(mocks.recordEvidence).toHaveBeenCalledWith({
      ownerId: user.id,
      labInstanceId: labId,
      deploymentAuthorizationId: authorizationId,
      payload,
    });
    expect(body.evidence).toMatchObject({ provenance: 'server-executed', state: 'evidence_recorded' });
  });

  it('records a deterministic not-ready guest observation instead of treating it as transport failure', async () => {
    const notReadyInspection = { ...inspection, listenerPresent: false, listenerAddress: null, loopbackOnly: false, ready: false };
    const notReadyPayload = { version: 1, readiness: { state: 'not-ready' } };
    mocks.inspectDesktopService.mockResolvedValue(notReadyInspection);
    mocks.buildPayload.mockReturnValue(notReadyPayload);
    mocks.buildFacts.mockReturnValue({ provenance: 'server-executed', readiness: { state: 'not-ready' } });

    const response = await POST(request(), context);
    const body = await response.json();

    expect(response.status).toBe(201);
    expect(mocks.recordEvidence).toHaveBeenCalledWith(expect.objectContaining({ payload: notReadyPayload }));
    expect(body.facts.readiness.state).toBe('not-ready');
  });
});
