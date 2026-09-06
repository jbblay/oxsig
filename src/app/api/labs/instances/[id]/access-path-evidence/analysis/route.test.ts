import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';

const mocks = vi.hoisted(() => ({
  requireAuth: vi.fn(),
  validateCsrfToken: vi.fn(),
  checkRateLimit: vi.fn(),
  getAccessEvidence: vi.fn(),
  storeAnalysis: vi.fn(),
  getGuestEvidence: vi.fn(),
  getRuntimeEvidence: vi.fn(),
  getAuthorization: vi.fn(),
  buildRuntimeFacts: vi.fn(),
  buildGuestFacts: vi.fn(),
  buildAccessFacts: vi.fn(),
  configured: vi.fn(),
  model: vi.fn(),
  interpret: vi.fn(),
  parseAnalysis: vi.fn((value) => value),
  parseAccessPayload: vi.fn((value) => value),
  parseGuestPayload: vi.fn((value) => value),
}));

vi.mock('@/lib/auth/middleware', () => ({ requireAuth: mocks.requireAuth }));
vi.mock('@/lib/security/csrf', () => ({ validateCsrfToken: mocks.validateCsrfToken }));
vi.mock('@/lib/security/rate-limit', () => ({ checkRateLimit: mocks.checkRateLimit }));
vi.mock('@/lib/execution-evidence/access-path-readiness', () => ({
  getAccessPathReadinessEvidence: mocks.getAccessEvidence,
  storeAccessPathReadinessAnalysis: mocks.storeAnalysis,
  AccessPathReadinessEvidenceConflictError: class AccessPathReadinessEvidenceConflictError extends Error {
    constructor(message: string, readonly code: string) { super(message); }
  },
}));
vi.mock('@/lib/execution-evidence/guest-service-readiness', () => ({
  getGuestServiceReadinessEvidence: mocks.getGuestEvidence,
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
  buildGuestServiceReadinessFacts: mocks.buildGuestFacts,
  guestServiceReadinessPayloadSchema: { parse: mocks.parseGuestPayload },
}));
vi.mock('@/lib/infrastructure/access-path-readiness-evidence', () => ({
  buildAccessPathReadinessFacts: mocks.buildAccessFacts,
  interpretAccessPathReadinessEvidence: mocks.interpret,
  accessPathReadinessAiConfigured: mocks.configured,
  accessPathReadinessModel: mocks.model,
  accessPathReadinessAnalysisSchema: { parse: mocks.parseAnalysis },
  accessPathReadinessPayloadSchema: { parse: mocks.parseAccessPayload },
  AccessPathReadinessInterpretationError: class AccessPathReadinessInterpretationError extends Error {
    constructor(message: string, readonly code: string) { super(message); }
  },
}));

import { POST } from './route';

const user = { id: 'user-1', role: 'user' as const };
const labId = '11111111-1111-4111-8111-111111111111';
const accessEvidenceId = '22222222-2222-4222-8222-222222222222';
const guestEvidenceId = '33333333-3333-4333-8333-333333333333';
const runtimeEvidenceId = '44444444-4444-4444-8444-444444444444';
const authorizationId = '55555555-5555-4555-8555-555555555555';

function request(body: unknown = {}) {
  return new NextRequest(`http://localhost/api/labs/instances/${labId}/access-path-evidence/analysis`, {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'content-type': 'application/json' },
  });
}

const context = { params: Promise.resolve({ id: labId }) };
const accessPayload = { prerequisiteGuestEvidenceId: guestEvidenceId };
const guestPayload = { prerequisiteRuntimeEvidenceId: runtimeEvidenceId };
const accessEvidence = {
  id: accessEvidenceId,
  deploymentAuthorizationId: authorizationId,
  executionId: '66666666-6666-4666-8666-666666666666',
  provenance: 'browser-observed',
  state: 'evidence_recorded',
  payload: accessPayload,
};
const guestEvidence = { id: guestEvidenceId, payload: guestPayload };
const runtimeEvidence = { id: runtimeEvidenceId };
const authorization = { id: authorizationId, planId: 'plan_123', state: 'analyzed' };
const runtimeFacts = { evidenceId: runtimeEvidenceId, readiness: { managementReady: true } };
const guestFacts = { evidenceId: guestEvidenceId, readiness: { guestServiceReady: true } };
const facts = { readiness: { browserDesktopPathReady: true }, provenance: 'browser-observed' };
const analysis = {
  summary: 'The browser completed the controlled desktop path.',
  observations: ['OXSIG issued an SSM session claim.', 'The browser completed the RFB handshake.'],
  interpretation: 'The browser reached a valid VNC endpoint through the controlled SSM path at the recorded time.',
  learningPoints: ['Browser-observed transport evidence is distinct from provider attestation.'],
  nextStep: 'Capture learner interaction or task evidence inside the ready desktop.',
  limitations: ['This does not prove human attention or later availability.'],
};

describe('POST /api/labs/instances/[id]/access-path-evidence/analysis', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireAuth.mockImplementation(async (
      req: NextRequest,
      handler: (req: NextRequest, currentUser: typeof user) => Promise<NextResponse>
    ) => handler(req, user));
    mocks.validateCsrfToken.mockResolvedValue(true);
    mocks.checkRateLimit.mockResolvedValue(null);
    mocks.getAccessEvidence.mockResolvedValue(accessEvidence);
    mocks.getGuestEvidence.mockResolvedValue(guestEvidence);
    mocks.getRuntimeEvidence.mockResolvedValue(runtimeEvidence);
    mocks.getAuthorization.mockResolvedValue(authorization);
    mocks.parseAccessPayload.mockReturnValue(accessPayload);
    mocks.parseGuestPayload.mockReturnValue(guestPayload);
    mocks.buildRuntimeFacts.mockReturnValue(runtimeFacts);
    mocks.buildGuestFacts.mockReturnValue(guestFacts);
    mocks.buildAccessFacts.mockReturnValue(facts);
    mocks.configured.mockReturnValue(true);
    mocks.model.mockReturnValue('test-model');
    mocks.interpret.mockResolvedValue(analysis);
    mocks.storeAnalysis.mockResolvedValue({
      ...accessEvidence,
      state: 'analyzed',
      analysisKind: 'access-path-readiness',
      analysis,
      model: 'test-model',
    });
    mocks.parseAnalysis.mockImplementation((value) => value);
  });

  it('keeps authentication as the outer boundary', async () => {
    mocks.requireAuth.mockResolvedValue(NextResponse.json({ error: 'Unauthorized' }, { status: 401 }));

    const response = await POST(request({ evidenceId: accessEvidenceId }), context);

    expect(response.status).toBe(401);
    expect(mocks.validateCsrfToken).not.toHaveBeenCalled();
    expect(mocks.getAccessEvidence).not.toHaveBeenCalled();
  });

  it('reconstructs access, guest, and runtime prerequisites before invoking AI', async () => {
    const response = await POST(request({ evidenceId: accessEvidenceId }), context);

    expect(response.status).toBe(200);
    expect(mocks.getAccessEvidence).toHaveBeenCalledWith({
      ownerId: user.id,
      labInstanceId: labId,
      evidenceId: accessEvidenceId,
    });
    expect(mocks.getAuthorization).toHaveBeenCalledWith(user.id, authorizationId);
    expect(mocks.getGuestEvidence).toHaveBeenCalledWith({
      ownerId: user.id,
      labInstanceId: labId,
      evidenceId: guestEvidenceId,
    });
    expect(mocks.getRuntimeEvidence).toHaveBeenCalledWith({
      ownerId: user.id,
      labInstanceId: labId,
      evidenceId: runtimeEvidenceId,
    });
    expect(mocks.buildRuntimeFacts).toHaveBeenCalledWith({ authorization, evidence: runtimeEvidence });
    expect(mocks.buildGuestFacts).toHaveBeenCalledWith({ authorization, runtimeFacts, evidence: guestEvidence });
    expect(mocks.buildAccessFacts).toHaveBeenCalledWith({ authorization, guestFacts, evidence: accessEvidence });
    expect(mocks.interpret).toHaveBeenCalledWith(facts);
    expect(mocks.storeAnalysis).toHaveBeenCalledWith({
      ownerId: user.id,
      evidenceId: accessEvidenceId,
      analysis,
      model: 'test-model',
    });
  });

  it('returns stored interpretation without another model call when already analyzed', async () => {
    const stored = { ...analysis, summary: 'Stored access-path interpretation.' };
    mocks.getAccessEvidence.mockResolvedValue({
      ...accessEvidence,
      state: 'analyzed',
      analysisKind: 'access-path-readiness',
      analysis: stored,
      model: 'stored-model',
    });

    const response = await POST(request({ evidenceId: accessEvidenceId }), context);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.analysis.summary).toBe('Stored access-path interpretation.');
    expect(body.model).toBe('stored-model');
    expect(mocks.interpret).not.toHaveBeenCalled();
    expect(mocks.storeAnalysis).not.toHaveBeenCalled();
  });

  it('returns the persisted winner after a concurrent analysis race', async () => {
    const winner = { ...analysis, summary: 'Persisted winner.' };
    mocks.storeAnalysis.mockResolvedValue({
      ...accessEvidence,
      state: 'analyzed',
      analysisKind: 'access-path-readiness',
      analysis: winner,
      model: 'winner-model',
    });

    const response = await POST(request({ evidenceId: accessEvidenceId }), context);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.analysis.summary).toBe('Persisted winner.');
    expect(body.model).toBe('winner-model');
  });
});
