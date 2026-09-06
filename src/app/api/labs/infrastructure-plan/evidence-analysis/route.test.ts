import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';

const mocks = vi.hoisted(() => ({
  requireAuth: vi.fn(),
  validateCsrfToken: vi.fn(),
  checkRateLimit: vi.fn(),
  getAuthorization: vi.fn(),
  getEvidence: vi.fn(),
  storeAnalysis: vi.fn(),
  buildFacts: vi.fn(),
  configured: vi.fn(),
  model: vi.fn(),
  interpret: vi.fn(),
}));

vi.mock('@/lib/auth/middleware', () => ({ requireAuth: mocks.requireAuth }));
vi.mock('@/lib/security/csrf', () => ({ validateCsrfToken: mocks.validateCsrfToken }));
vi.mock('@/lib/security/rate-limit', () => ({ checkRateLimit: mocks.checkRateLimit }));
vi.mock('@/lib/infrastructure/deployment-authorization', () => ({
  getDeploymentAuthorizationById: mocks.getAuthorization,
}));
vi.mock('@/lib/execution-evidence/server', () => ({
  getDeploymentEvidenceForAnalysis: mocks.getEvidence,
  storeExecutionEvidenceAnalysis: mocks.storeAnalysis,
  ExecutionEvidenceConflictError: class ExecutionEvidenceConflictError extends Error {
    constructor(message: string, readonly code: string) { super(message); }
  },
}));
vi.mock('@/lib/infrastructure/deployment-evidence-interpreter', () => ({
  buildDeploymentEvidenceFacts: mocks.buildFacts,
  deploymentEvidenceAiConfigured: mocks.configured,
  deploymentEvidenceModel: mocks.model,
  interpretDeploymentEvidence: mocks.interpret,
  DeploymentEvidenceInterpretationError: class DeploymentEvidenceInterpretationError extends Error {
    constructor(message: string, readonly code: string) { super(message); }
  },
}));

import { POST } from './route';

const user = { id: 'user-1', role: 'user' as const };
const authorizationId = '11111111-1111-4111-8111-111111111111';
const executionId = '22222222-2222-4222-8222-222222222222';
const evidenceId = '33333333-3333-4333-8333-333333333333';

function request(body: unknown) {
  return new NextRequest('http://localhost/api/labs/infrastructure-plan/evidence-analysis', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'content-type': 'application/json' },
  });
}

const authorization = {
  id: authorizationId,
  ownerId: user.id,
  planId: 'plan_123',
  planHash: 'a'.repeat(64),
  planSnapshot: {
    version: 1,
    sourceDesignVersion: 1,
    summary: { devices: 1, links: 0, workloads: 1, networkFunctions: 0, segments: 0 },
    workloads: [],
    networkFunctions: [],
    segments: [],
    links: [],
    actions: [],
    readiness: { executable: true, blockers: [], warnings: [] },
  },
  sourceDesignUpdatedAt: '2026-09-06T01:00:00.000Z',
  executionSupport: { supported: true, adapter: 'existing-lab-vm', reasons: [] },
  state: 'evidence_recorded',
  executionId,
  labInstanceId: '44444444-4444-4444-8444-444444444444',
  expiresAt: '2026-09-06T01:30:00.000Z',
  createdAt: '2026-09-06T01:00:00.000Z',
  updatedAt: '2026-09-06T01:05:00.000Z',
};

const evidence = {
  id: evidenceId,
  ownerId: user.id,
  executionId,
  source: 'deployment',
  surface: 'infrastructure-designer',
  provenance: 'provider-attested',
  state: 'evidence_recorded',
  stdout: '',
  stderr: '',
  payload: {},
  createdAt: '2026-09-06T01:05:00.000Z',
  updatedAt: '2026-09-06T01:05:00.000Z',
};

const facts = {
  provenance: 'provider-attested',
  attestationScope: 'provider-allocation',
  provider: 'aws-ec2',
  externalId: 'i-123',
};

const analysis = {
  summary: 'Provider allocation confirmed.',
  observations: ['AWS returned an instance identity.'],
  interpretation: 'The allocation boundary succeeded.',
  learningPoints: ['Allocation does not prove guest readiness.'],
  nextStep: 'Collect runtime readiness evidence.',
  limitations: ['Boot completion is not proven.'],
};

describe('POST /api/labs/infrastructure-plan/evidence-analysis', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireAuth.mockImplementation(async (
      req: NextRequest,
      handler: (req: NextRequest, currentUser: typeof user) => Promise<NextResponse>
    ) => handler(req, user));
    mocks.validateCsrfToken.mockResolvedValue(true);
    mocks.checkRateLimit.mockResolvedValue(null);
    mocks.getAuthorization.mockResolvedValue(authorization);
    mocks.getEvidence.mockResolvedValue(evidence);
    mocks.buildFacts.mockReturnValue(facts);
    mocks.configured.mockReturnValue(true);
    mocks.model.mockReturnValue('test-model');
    mocks.interpret.mockResolvedValue(analysis);
    mocks.storeAnalysis.mockResolvedValue({ ...evidence, state: 'analyzed', analysisKind: 'deployment', analysis, model: 'test-model' });
  });

  it('keeps authentication as the outer boundary', async () => {
    mocks.requireAuth.mockResolvedValue(NextResponse.json({ error: 'Unauthorized' }, { status: 401 }));

    const response = await POST(request({ authorizationId }));

    expect(response.status).toBe(401);
    expect(mocks.validateCsrfToken).not.toHaveBeenCalled();
    expect(mocks.getAuthorization).not.toHaveBeenCalled();
  });

  it('checks CSRF before loading deployment state', async () => {
    mocks.validateCsrfToken.mockResolvedValue(false);

    const response = await POST(request({ authorizationId }));

    expect(response.status).toBe(403);
    expect(mocks.getAuthorization).not.toHaveBeenCalled();
    expect(mocks.getEvidence).not.toHaveBeenCalled();
  });

  it('refuses interpretation until the authorization has provider evidence', async () => {
    mocks.getAuthorization.mockResolvedValue({ ...authorization, state: 'executing' });

    const response = await POST(request({ authorizationId }));
    const body = await response.json();

    expect(response.status).toBe(409);
    expect(body.code).toBe('DEPLOYMENT_EVIDENCE_NOT_READY');
    expect(mocks.getEvidence).not.toHaveBeenCalled();
    expect(mocks.interpret).not.toHaveBeenCalled();
  });

  it('returns stored deployment analysis idempotently without another model call', async () => {
    const stored = { ...analysis, summary: 'Stored provider interpretation.' };
    mocks.getAuthorization.mockResolvedValue({ ...authorization, state: 'analyzed' });
    mocks.getEvidence.mockResolvedValue({
      ...evidence,
      state: 'analyzed',
      analysisKind: 'deployment',
      analysis: stored,
      model: 'stored-model',
    });

    const response = await POST(request({ authorizationId }));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(body.analysis.summary).toBe('Stored provider interpretation.');
    expect(body.model).toBe('stored-model');
    expect(mocks.interpret).not.toHaveBeenCalled();
    expect(mocks.storeAnalysis).not.toHaveBeenCalled();
  });

  it('interprets only server-loaded provider evidence and persists the analysis', async () => {
    const response = await POST(request({ authorizationId }));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(mocks.getEvidence).toHaveBeenCalledWith({ ownerId: user.id, authorizationId });
    expect(mocks.buildFacts).toHaveBeenCalledWith({ authorization, evidence });
    expect(mocks.interpret).toHaveBeenCalledWith(facts);
    expect(mocks.storeAnalysis).toHaveBeenCalledWith({
      ownerId: user.id,
      evidenceId,
      analysisKind: 'deployment',
      analysis,
      model: 'test-model',
    });
    expect(body.evidence).toMatchObject({ id: evidenceId, provenance: 'provider-attested', state: 'analyzed' });
    expect(body.authorization.state).toBe('analyzed');
  });
});