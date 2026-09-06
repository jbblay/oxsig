import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';

const mocks = vi.hoisted(() => ({
  requireAuth: vi.fn(),
  validateCsrfToken: vi.fn(),
  checkRateLimit: vi.fn(),
  getGuestEvidence: vi.fn(),
  storeAnalysis: vi.fn(),
  getRuntimeEvidence: vi.fn(),
  getAuthorization: vi.fn(),
  buildRuntimeFacts: vi.fn(),
  buildFacts: vi.fn(),
  configured: vi.fn(),
  model: vi.fn(),
  interpret: vi.fn(),
  parseAnalysis: vi.fn((value) => value),
  parsePayload: vi.fn((value) => value),
}));

vi.mock('@/lib/auth/middleware', () => ({ requireAuth: mocks.requireAuth }));
vi.mock('@/lib/security/csrf', () => ({ validateCsrfToken: mocks.validateCsrfToken }));
vi.mock('@/lib/security/rate-limit', () => ({ checkRateLimit: mocks.checkRateLimit }));
vi.mock('@/lib/execution-evidence/guest-service-readiness', () => ({
  getGuestServiceReadinessEvidence: mocks.getGuestEvidence,
  storeGuestServiceReadinessAnalysis: mocks.storeAnalysis,
  GuestServiceReadinessEvidenceConflictError: class GuestServiceReadinessEvidenceConflictError extends Error {
    constructor(message: string, readonly code: string) { super(message); }
  },
}));
vi.mock('@/lib/execution-evidence/runtime-readiness', () => ({
  getRuntimeReadinessEvidence: mocks.getRuntimeEvidence,
}));
vi.mock('@/lib/infrastructure/deployment-authorization', () => ({
  getDeploymentAuthorizationById: mocks.getAuthorization,
}));
vi.mock('@/lib/infrastructure/runtime-readiness-evidence', () => ({
  buildRuntimeReadinessFacts: mocks.buildRuntimeFacts,
}));
vi.mock('@/lib/infrastructure/guest-service-readiness-evidence', () => ({
  buildGuestServiceReadinessFacts: mocks.buildFacts,
  interpretGuestServiceReadinessEvidence: mocks.interpret,
  guestServiceReadinessAiConfigured: mocks.configured,
  guestServiceReadinessModel: mocks.model,
  guestServiceReadinessAnalysisSchema: { parse: mocks.parseAnalysis },
  guestServiceReadinessPayloadSchema: { parse: mocks.parsePayload },
  GuestServiceReadinessInterpretationError: class GuestServiceReadinessInterpretationError extends Error {
    constructor(message: string, readonly code: string) { super(message); }
  },
}));

import { POST } from './route';

const user = { id: 'user-1', role: 'user' as const };
const labId = '11111111-1111-4111-8111-111111111111';
const evidenceId = '22222222-2222-4222-8222-222222222222';
const runtimeEvidenceId = '33333333-3333-4333-8333-333333333333';
const authorizationId = '44444444-4444-4444-8444-444444444444';

function request(body: unknown = {}) {
  return new NextRequest(`http://localhost/api/labs/instances/${labId}/guest-service-evidence/analysis`, {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'content-type': 'application/json' },
  });
}

const context = { params: Promise.resolve({ id: labId }) };
const guestPayload = { prerequisiteRuntimeEvidenceId: runtimeEvidenceId };
const guestEvidence = {
  id: evidenceId,
  deploymentAuthorizationId: authorizationId,
  executionId: '55555555-5555-4555-8555-555555555555',
  provenance: 'server-executed',
  state: 'evidence_recorded',
  payload: guestPayload,
};
const runtimeEvidence = { id: runtimeEvidenceId };
const authorization = { id: authorizationId, planId: 'plan_123', state: 'analyzed' };
const runtimeFacts = { evidenceId: runtimeEvidenceId, readiness: { managementReady: true } };
const facts = { readiness: { state: 'ready' }, provenance: 'server-executed' };
const analysis = {
  summary: 'The guest desktop service is locally ready.',
  observations: ['The service is running.', 'The expected listener is loopback-only.'],
  interpretation: 'The local VNC service is ready for the next access-path check.',
  learningPoints: ['Guest service readiness and end-to-end browser access are separate facts.'],
  nextStep: 'Test the controlled SSM port-forwarding and VNC handshake.',
  limitations: ['The browser tunnel is not attested by this check.'],
};

describe('POST /api/labs/instances/[id]/guest-service-evidence/analysis', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireAuth.mockImplementation(async (
      req: NextRequest,
      handler: (req: NextRequest, currentUser: typeof user) => Promise<NextResponse>
    ) => handler(req, user));
    mocks.validateCsrfToken.mockResolvedValue(true);
    mocks.checkRateLimit.mockResolvedValue(null);
    mocks.getGuestEvidence.mockResolvedValue(guestEvidence);
    mocks.getRuntimeEvidence.mockResolvedValue(runtimeEvidence);
    mocks.getAuthorization.mockResolvedValue(authorization);
    mocks.parsePayload.mockReturnValue(guestPayload);
    mocks.buildRuntimeFacts.mockReturnValue(runtimeFacts);
    mocks.buildFacts.mockReturnValue(facts);
    mocks.configured.mockReturnValue(true);
    mocks.model.mockReturnValue('test-model');
    mocks.interpret.mockResolvedValue(analysis);
    mocks.storeAnalysis.mockResolvedValue({
      ...guestEvidence,
      state: 'analyzed',
      analysisKind: 'guest-service-readiness',
      analysis,
      model: 'test-model',
    });
    mocks.parseAnalysis.mockImplementation((value) => value);
  });

  it('keeps authentication as the outer boundary', async () => {
    mocks.requireAuth.mockResolvedValue(NextResponse.json({ error: 'Unauthorized' }, { status: 401 }));

    const response = await POST(request({ evidenceId }), context);

    expect(response.status).toBe(401);
    expect(mocks.validateCsrfToken).not.toHaveBeenCalled();
    expect(mocks.getGuestEvidence).not.toHaveBeenCalled();
  });

  it('checks CSRF before loading evidence', async () => {
    mocks.validateCsrfToken.mockResolvedValue(false);

    const response = await POST(request({ evidenceId }), context);

    expect(response.status).toBe(403);
    expect(mocks.getGuestEvidence).not.toHaveBeenCalled();
  });

  it('reconstructs the exact runtime prerequisite chain before AI', async () => {
    const response = await POST(request({ evidenceId }), context);

    expect(response.status).toBe(200);
    expect(mocks.getGuestEvidence).toHaveBeenCalledWith({ ownerId: user.id, labInstanceId: labId, evidenceId });
    expect(mocks.getAuthorization).toHaveBeenCalledWith(user.id, authorizationId);
    expect(mocks.getRuntimeEvidence).toHaveBeenCalledWith({
      ownerId: user.id,
      labInstanceId: labId,
      evidenceId: runtimeEvidenceId,
    });
    expect(mocks.buildRuntimeFacts).toHaveBeenCalledWith({ authorization, evidence: runtimeEvidence });
    expect(mocks.buildFacts).toHaveBeenCalledWith({ authorization, runtimeFacts, evidence: guestEvidence });
    expect(mocks.interpret).toHaveBeenCalledWith(facts);
    expect(mocks.storeAnalysis).toHaveBeenCalledWith({
      ownerId: user.id,
      evidenceId,
      analysis,
      model: 'test-model',
    });
  });

  it('returns stored analysis without another model call when already analyzed', async () => {
    const stored = { ...analysis, summary: 'Stored guest-service interpretation.' };
    mocks.getGuestEvidence.mockResolvedValue({
      ...guestEvidence,
      state: 'analyzed',
      analysisKind: 'guest-service-readiness',
      analysis: stored,
      model: 'stored-model',
    });

    const response = await POST(request({ evidenceId }), context);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.analysis.summary).toBe('Stored guest-service interpretation.');
    expect(body.model).toBe('stored-model');
    expect(mocks.interpret).not.toHaveBeenCalled();
    expect(mocks.storeAnalysis).not.toHaveBeenCalled();
  });

  it('returns the persisted analysis winner after a concurrent analysis race', async () => {
    const winner = { ...analysis, summary: 'Persisted winner.' };
    mocks.storeAnalysis.mockResolvedValue({
      ...guestEvidence,
      state: 'analyzed',
      analysisKind: 'guest-service-readiness',
      analysis: winner,
      model: 'winner-model',
    });

    const response = await POST(request({ evidenceId }), context);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.analysis.summary).toBe('Persisted winner.');
    expect(body.model).toBe('winner-model');
  });
});
