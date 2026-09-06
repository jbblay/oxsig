import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';

const mocks = vi.hoisted(() => ({
  requireAuth: vi.fn(),
  validateCsrfToken: vi.fn(),
  checkRateLimit: vi.fn(),
  poolQuery: vi.fn(),
  getAuthorization: vi.fn(),
  diagnostics: vi.fn(),
  buildPayload: vi.fn(),
  buildFacts: vi.fn(),
  recordEvidence: vi.fn(),
}));

vi.mock('@/lib/auth/middleware', () => ({ requireAuth: mocks.requireAuth }));
vi.mock('@/lib/security/csrf', () => ({ validateCsrfToken: mocks.validateCsrfToken }));
vi.mock('@/lib/security/rate-limit', () => ({ checkRateLimit: mocks.checkRateLimit }));
vi.mock('@/lib/db/pool', () => ({ getPool: () => ({ query: mocks.poolQuery }) }));
vi.mock('@/lib/infrastructure/deployment-authorization', () => ({
  getDeploymentAuthorizationById: mocks.getAuthorization,
}));
vi.mock('@/lib/labs/terminal-observability', () => ({ getLabTerminalDiagnostics: mocks.diagnostics }));
vi.mock('@/lib/execution-evidence/runtime-readiness', () => ({
  recordRuntimeReadinessEvidence: mocks.recordEvidence,
}));
vi.mock('@/lib/infrastructure/runtime-readiness-evidence', () => ({
  buildRuntimeReadinessPayload: mocks.buildPayload,
  buildRuntimeReadinessFacts: mocks.buildFacts,
  RuntimeReadinessInterpretationError: class RuntimeReadinessInterpretationError extends Error {
    constructor(message: string, readonly code: string) { super(message); }
  },
}));

import { POST } from './route';

const user = { id: 'user-1', role: 'user' as const };
const labId = '11111111-1111-4111-8111-111111111111';
const authorizationId = '22222222-2222-4222-8222-222222222222';

function request() {
  return new NextRequest(`http://localhost/api/labs/instances/${labId}/readiness-evidence`, {
    method: 'POST',
  });
}

const context = { params: Promise.resolve({ id: labId }) };
const lab = {
  id: labId,
  runtime_provider: 'aws-ec2',
  runtime_external_id: 'i-0123456789abcdef0',
  expires_at: '2099-09-06T02:00:00.000Z',
};
const authorization = {
  id: authorizationId,
  ownerId: user.id,
  planId: 'plan_123',
  planHash: 'a'.repeat(64),
  state: 'analyzed',
};
const diagnostics = { ec2State: 'running', ssmPingStatus: 'Online', ready: true };
const payload = { version: 1, readiness: { state: 'ready' } };
const evidence = {
  id: '33333333-3333-4333-8333-333333333333',
  executionId: '44444444-4444-4444-8444-444444444444',
  provenance: 'server-executed',
  state: 'evidence_recorded',
  evidenceRecordedAt: '2026-09-06T02:00:00.000Z',
};
const facts = { provenance: 'server-executed', readiness: { state: 'ready' } };

describe('POST /api/labs/instances/[id]/readiness-evidence', () => {
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
    mocks.diagnostics.mockResolvedValue(diagnostics);
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

  it('checks CSRF before loading lab or provider state', async () => {
    mocks.validateCsrfToken.mockResolvedValue(false);

    const response = await POST(request(), context);

    expect(response.status).toBe(403);
    expect(mocks.poolQuery).not.toHaveBeenCalled();
    expect(mocks.diagnostics).not.toHaveBeenCalled();
  });

  it('requires an owner-bound controlled deployment authorization', async () => {
    mocks.poolQuery.mockImplementation(async (sql: string) => {
      if (sql.includes('FROM lab_instances')) return { rows: [lab] };
      if (sql.includes('FROM deployment_authorizations')) return { rows: [] };
      throw new Error('Unexpected SQL');
    });

    const response = await POST(request(), context);
    const body = await response.json();

    expect(response.status).toBe(409);
    expect(body.code).toBe('DEPLOYMENT_AUTHORIZATION_NOT_READY');
    expect(mocks.diagnostics).not.toHaveBeenCalled();
  });

  it('captures server-observed readiness from the bound AWS runtime and persists it before analysis', async () => {
    const response = await POST(request(), context);
    const body = await response.json();

    expect(response.status).toBe(201);
    expect(response.headers.get('cache-control')).toContain('no-store');
    expect(mocks.diagnostics).toHaveBeenCalledWith(lab.runtime_external_id);
    expect(mocks.buildPayload).toHaveBeenCalledWith({
      authorization,
      labInstanceId: labId,
      diagnostics,
    });
    expect(mocks.recordEvidence).toHaveBeenCalledWith({
      ownerId: user.id,
      labInstanceId: labId,
      deploymentAuthorizationId: authorizationId,
      payload,
    });
    expect(body.evidence).toMatchObject({ provenance: 'server-executed', state: 'evidence_recorded' });
    expect(body.facts.readiness.state).toBe('ready');
  });

  it('records a provider-observed not-ready result instead of treating it as a transport failure', async () => {
    const notReadyDiagnostics = { ec2State: 'running', ssmPingStatus: 'ConnectionLost', ready: false };
    const notReadyPayload = { version: 1, readiness: { state: 'not-ready' } };
    mocks.diagnostics.mockResolvedValue(notReadyDiagnostics);
    mocks.buildPayload.mockReturnValue(notReadyPayload);
    mocks.buildFacts.mockReturnValue({ provenance: 'server-executed', readiness: { state: 'not-ready' } });

    const response = await POST(request(), context);
    const body = await response.json();

    expect(response.status).toBe(201);
    expect(mocks.recordEvidence).toHaveBeenCalledWith(expect.objectContaining({ payload: notReadyPayload }));
    expect(body.facts.readiness.state).toBe('not-ready');
  });
});
