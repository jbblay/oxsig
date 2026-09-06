import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';

const mocks = vi.hoisted(() => ({
  requireAuth: vi.fn(),
  validateCsrfToken: vi.fn(),
  checkRateLimit: vi.fn(),
  poolQuery: vi.fn(),
  explainPractitionerEvidence: vi.fn(),
  planPractitionerStep: vi.fn(),
  getTerminalEvidenceForAnalysis: vi.fn(),
  storeExecutionEvidenceAnalysis: vi.fn(),
}));

vi.mock('server-only', () => ({}));
vi.mock('@/lib/auth/middleware', () => ({ requireAuth: mocks.requireAuth }));
vi.mock('@/lib/security/csrf', () => ({ validateCsrfToken: mocks.validateCsrfToken }));
vi.mock('@/lib/security/rate-limit', () => ({ checkRateLimit: mocks.checkRateLimit }));
vi.mock('@/lib/db/pool', () => ({ getPool: () => ({ query: mocks.poolQuery }) }));
vi.mock('@/lib/ai-practitioner/server', () => ({
  aiPractitionerConfigured: () => true,
  aiPractitionerModel: () => 'test-model',
  explainPractitionerEvidence: mocks.explainPractitionerEvidence,
  planPractitionerStep: mocks.planPractitionerStep,
  practitionerRequestSchema: {
    safeParse: (value: unknown) => ({ success: true, data: value }),
  },
}));
vi.mock('@/lib/execution-evidence/server', () => ({
  getTerminalEvidenceForAnalysis: mocks.getTerminalEvidenceForAnalysis,
  storeExecutionEvidenceAnalysis: mocks.storeExecutionEvidenceAnalysis,
  ExecutionEvidenceConflictError: class ExecutionEvidenceConflictError extends Error {
    constructor(message: string, readonly code: string) {
      super(message);
    }
  },
}));

import { POST } from './route';

const user = { id: 'user-1', clerkUserId: 'clerk-1', role: 'user' as const };
const labId = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const evidenceId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const executionId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

function request(body: unknown) {
  return new NextRequest('http://localhost/api/ai/practitioner', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'content-type': 'application/json' },
  });
}

function evidence(overrides: Record<string, unknown> = {}) {
  return {
    id: evidenceId,
    ownerId: user.id,
    labInstanceId: labId,
    executionId,
    source: 'interactive-terminal',
    surface: 'ai-practitioner',
    provenance: 'browser-observed',
    state: 'evidence_recorded',
    command: 'uname -a',
    stdout: 'ledger-output',
    stderr: 'ledger-stderr',
    exitCode: 7,
    payload: {},
    createdAt: '2026-09-06T01:00:00.000Z',
    updatedAt: '2026-09-06T01:00:00.000Z',
    ...overrides,
  };
}

describe('AI Practitioner evidence analysis', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireAuth.mockImplementation(async (
      req: NextRequest,
      handler: (req: NextRequest, currentUser: typeof user) => Promise<NextResponse>
    ) => handler(req, user));
    mocks.validateCsrfToken.mockResolvedValue(true);
    mocks.checkRateLimit.mockResolvedValue(null);
    mocks.poolQuery.mockImplementation(async (sql: string) => {
      if (sql.includes('FROM lab_instances')) {
        return {
          rows: [{
            id: labId,
            slug: 'ubuntu-security-lab',
            status: 'running',
            runtime_provider: 'aws-ec2',
            runtime_external_id: 'i-123',
          }],
        };
      }
      if (sql.includes('INSERT INTO ai_practitioner_events')) return { rows: [] };
      throw new Error(`Unexpected SQL: ${sql.slice(0, 100)}`);
    });
    mocks.getTerminalEvidenceForAnalysis.mockResolvedValue(evidence());
    mocks.explainPractitionerEvidence.mockResolvedValue({
      summary: 'Stored evidence analyzed.',
      observations: ['ledger-output'],
      interpretation: 'The stored command failed with exit code 7.',
      nextStep: 'Inspect the error.',
      vaultNote: 'Evidence-backed result.',
    });
    mocks.storeExecutionEvidenceAnalysis.mockResolvedValue(evidence({
      state: 'analyzed',
      analysisKind: 'ai-practitioner',
      model: 'test-model',
    }));
  });

  it('ignores resubmitted browser output and analyzes the server-stored evidence record', async () => {
    const response = await POST(request({
      action: 'explain',
      labInstanceId: labId,
      prompt: 'What happened?',
      command: 'uname -a',
      stdout: 'forged-client-output',
      stderr: '',
      exitCode: 0,
    }));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(mocks.getTerminalEvidenceForAnalysis).toHaveBeenCalledWith({
      ownerId: user.id,
      labInstanceId: labId,
      command: 'uname -a',
      surface: 'ai-practitioner',
    });
    expect(mocks.explainPractitionerEvidence).toHaveBeenCalledWith(expect.objectContaining({
      command: 'uname -a',
      stdout: 'ledger-output',
      stderr: 'ledger-stderr',
      exitCode: 7,
    }));
    expect(mocks.explainPractitionerEvidence).not.toHaveBeenCalledWith(expect.objectContaining({
      stdout: 'forged-client-output',
    }));
    expect(mocks.storeExecutionEvidenceAnalysis).toHaveBeenCalledWith(expect.objectContaining({
      evidenceId,
      analysisKind: 'ai-practitioner',
    }));
    expect(body.evidence).toMatchObject({
      id: evidenceId,
      executionId,
      provenance: 'browser-observed',
      state: 'analyzed',
    });
  });

  it('reuses an already analyzed evidence record without another AI provider call', async () => {
    mocks.getTerminalEvidenceForAnalysis.mockResolvedValue(evidence({
      state: 'analyzed',
      analysisKind: 'ai-practitioner',
      analysis: { summary: 'Already analyzed.' },
      model: 'stored-model',
    }));

    const response = await POST(request({
      action: 'explain',
      labInstanceId: labId,
      prompt: 'Explain again',
      command: 'uname -a',
      stdout: 'ignored',
      stderr: '',
      exitCode: 0,
    }));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.analysis).toEqual({ summary: 'Already analyzed.' });
    expect(body.model).toBe('stored-model');
    expect(mocks.explainPractitionerEvidence).not.toHaveBeenCalled();
    expect(mocks.storeExecutionEvidenceAnalysis).not.toHaveBeenCalled();
  });
});
