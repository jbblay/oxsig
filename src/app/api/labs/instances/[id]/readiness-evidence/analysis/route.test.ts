import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';

const mocks = vi.hoisted(() => ({
  requireAuth: vi.fn(),
  validateCsrfToken: vi.fn(),
  checkRateLimit: vi.fn(),
  getEvidence: vi.fn(),
  storeAnalysis: vi.fn(),
  getAuthorization: vi.fn(),
  buildFacts: vi.fn(),
  configured: vi.fn(),
  model: vi.fn(),
  interpret: vi.fn(),
  parseAnalysis: vi.fn((value) => value),
}));

vi.mock('@/lib/auth/middleware', () => ({ requireAuth: mocks.requireAuth }));
vi.mock('@/lib/security/csrf', () => ({ validateCsrfToken: mocks.validateCsrfToken }));
vi.mock('@/lib/security/rate-limit', () => ({ checkRateLimit: mocks.checkRateLimit }));
vi.mock('@/lib/execution-evidence/runtime-readiness', () => ({
  getRuntimeReadinessEvidence: mocks.getEvidence,
  storeRuntimeReadinessAnalysis: mocks.storeAnalysis,
  RuntimeReadinessEvidenceConflictError: class RuntimeReadinessEvidenceConflictError extends Error {
    constructor(message: string, readonly code: string) { super(message); }
  },
}));
vi.mock('@/lib/infrastructure/deployment-authorization', () => ({
  getDeploymentAuthorizationById: mocks.getAuthorization,
}));
vi.mock('@/lib/infrastructure/runtime-readiness-evidence', () => ({
  buildRuntimeReadinessFacts: mocks.buildFacts,
  interpretRuntimeReadinessEvidence: mocks.interpret,
  runtimeReadinessAiConfigured: mocks.configured,
  runtimeReadinessModel: mocks.model,
  runtimeReadinessAnalysisSchema: { parse: mocks.parseAnalysis },
  RuntimeReadinessInterpretationError: class RuntimeReadinessInterpretationError extends Error {
    constructor(message: string, readonly code: string) { super(message); }
  },
}));

import { POST } from './route';

const user = { id: 'user-1', role: 'user' as const };
const labId = '11111111-1111-4111-8111-111111111111';
const evidenceId = '22222222-2222-4222-8222-222222222222';
const authorizationId = '33333333-3333-4333-8333-333333333333';

function request(body: unknown = {}) {
  return new NextRequest(`http://localhost/api/labs/instances/${labId}/readiness-evidence/analysis`, {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'content-type': 'application/json' },
  });
}

const context = { params: Promise.resolve({ id: labId }) };
const evidence = {
  id: evidenceId,
  deploymentAuthorizationId: authorizationId,
  executionId: '44444444-4444-4444-8444-444444444444',
  provenance: 'server-executed',
  state: 'evidence_recorded',
  payload: {},
};
const authorization = { id: authorizationId, planId: 'plan_123', state: 'analyzed' };
const facts = { readiness: { state: 'ready' }, provenance: 'server-executed' };
const analysis = {
  summary: 'The terminal management path is ready.',
  observations: ['EC2 is running.', 'SSM is Online.'],
  interpretation: 'The management path can now be used for a terminal session.',
  learningPoints: ['Running and reachable are separate runtime properties.'],
  nextStep: 'Open a terminal and collect command evidence.',
  limitations: ['Application services are not attested.'],
};

describe('POST /api/labs/instances/[id]/readiness-evidence/analysis', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireAuth.mockImplementation(async (
      req: NextRequest,
      handler: (req: NextRequest, currentUser: typeof user) => Promise<NextResponse>
    ) => handler(req, user));
    mocks.validateCsrfToken.mockResolvedValue(true);
    mocks.checkRateLimit.mockResolvedValue(null);
    mocks.getEvidence.mockResolvedValue(evidence);
    mocks.getAuthorization.mockResolvedValue(authorization);
    mocks.buildFacts.mockReturnValue(facts);
    mocks.configured.mockReturnValue(true);
    mocks.model.mockReturnValue('test-model');
    mocks.interpret.mockResolvedValue(analysis);
    mocks.storeAnalysis.mockResolvedValue({
      ...evidence,
      state: 'analyzed',
      analysisKind: 'runtime-readiness',
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
    expect(mocks.getEvidence).not.toHaveBeenCalled();
  });

  it('checks CSRF before loading evidence', async () => {
    mocks.validateCsrfToken.mockResolvedValue(false);

    const response = await POST(request({ evidenceId }), context);

    expect(response.status).toBe(403);
    expect(mocks.getEvidence).not.toHaveBeenCalled();
  });

  it('loads the owner-bound readiness record and exact deployment authorization before AI', async () => {
    const response = await POST(request({ evidenceId }), context);

    expect(response.status).toBe(200);
    expect(mocks.getEvidence).toHaveBeenCalledWith({ ownerId: user.id, labInstanceId: labId, evidenceId });
    expect(mocks.getAuthorization).toHaveBeenCalledWith(user.id, authorizationId);
    expect(mocks.buildFacts).toHaveBeenCalledWith({ authorization, evidence });
    expect(mocks.interpret).toHaveBeenCalledWith(facts);
    expect(mocks.storeAnalysis).toHaveBeenCalledWith({
      ownerId: user.id,
      evidenceId,
      analysis,
      model: 'test-model',
    });
  });

  it('returns stored analysis without another model call when evidence is already analyzed', async () => {
    const stored = { ...analysis, summary: 'Stored readiness interpretation.' };
    mocks.getEvidence.mockResolvedValue({
      ...evidence,
      state: 'analyzed',
      analysisKind: 'runtime-readiness',
      analysis: stored,
      model: 'stored-model',
    });

    const response = await POST(request({ evidenceId }), context);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.analysis.summary).toBe('Stored readiness interpretation.');
    expect(body.model).toBe('stored-model');
    expect(mocks.interpret).not.toHaveBeenCalled();
    expect(mocks.storeAnalysis).not.toHaveBeenCalled();
  });

  it('returns the persisted analysis winner after a concurrent analysis race', async () => {
    const winner = { ...analysis, summary: 'Persisted winner.' };
    mocks.storeAnalysis.mockResolvedValue({
      ...evidence,
      state: 'analyzed',
      analysisKind: 'runtime-readiness',
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
