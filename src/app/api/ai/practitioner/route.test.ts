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

import { GET, POST } from './route';

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

function getRequest() {
  return new NextRequest('http://localhost/api/ai/practitioner', { method: 'GET' });
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

describe('AI Practitioner durable history', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireAuth.mockImplementation(async (
      req: NextRequest,
      handler: (req: NextRequest, currentUser: typeof user) => Promise<NextResponse>
    ) => handler(req, user));
    mocks.checkRateLimit.mockResolvedValue(null);
  });

  it('reconstructs the owner timeline and preserves the original lab identity', async () => {
    mocks.poolQuery.mockResolvedValue({
      rows: [
        {
          id: 'plan-1',
          lab_instance_id: labId,
          event_type: 'plan',
          prompt: 'Inspect the kernel',
          command: 'uname -a',
          metadata: {
            plan: {
              title: 'Inspect kernel',
              objective: 'Read kernel information',
              explanation: 'Run a read-only kernel inspection.',
              command: 'uname -a',
              risk: 'read-only',
            },
          },
        },
        {
          id: 'execution-1',
          lab_instance_id: labId,
          event_type: 'execution',
          prompt: null,
          command: 'uname -a',
          stdout: 'Linux host',
          stderr: '',
          exit_code: 0,
          metadata: {
            risk: 'read-only',
            executionId,
            evidenceId,
            provenance: 'browser-observed',
            executionReceiptId: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
            terminalSessionId: 'session-1',
          },
        },
        {
          id: 'analysis-1',
          lab_instance_id: labId,
          event_type: 'analysis',
          prompt: 'Inspect the kernel',
          command: 'uname -a',
          metadata: {
            analysis: {
              summary: 'The command returned the running kernel identity.',
              interpretation: 'This confirms the kernel and architecture.',
              nextStep: 'Inspect OS release metadata.',
            },
          },
        },
      ],
    });

    const response = await GET(getRequest());
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(mocks.poolQuery).toHaveBeenCalledWith(expect.stringContaining('WHERE owner_id = $1'), [user.id]);
    expect(body.entries).toHaveLength(1);
    expect(body.entries[0]).toMatchObject({
      prompt: 'Inspect the kernel',
      labInstanceId: labId,
      execution: {
        command: 'uname -a',
        evidenceId,
        executionId,
      },
      analysis: {
        summary: 'The command returned the running kernel identity.',
      },
    });
    expect(body.history).toEqual([
      { id: 'plan-1:user', role: 'user', content: 'Inspect the kernel' },
      { id: 'plan-1:plan', role: 'assistant', content: 'Run a read-only kernel inspection.' },
      { id: 'analysis-1:analysis', role: 'assistant', content: 'The command returned the running kernel identity.' },
    ]);
  });
});

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

  it('requires an exact evidence ID before loading terminal evidence', async () => {
    const response = await POST(request({
      action: 'explain',
      labInstanceId: labId,
      prompt: 'What happened?',
      command: 'uname -a',
      stdout: 'forged-client-output',
      stderr: '',
      exitCode: 0,
    }));

    expect(response.status).toBe(400);
    expect(mocks.getTerminalEvidenceForAnalysis).not.toHaveBeenCalled();
  });

  it('ignores resubmitted browser output and analyzes the exact server-stored evidence record', async () => {
    const response = await POST(request({
      action: 'explain',
      evidenceId,
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
      evidenceId,
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

  it('reuses an already analyzed exact evidence record without another AI provider call', async () => {
    mocks.getTerminalEvidenceForAnalysis.mockResolvedValue(evidence({
      state: 'analyzed',
      analysisKind: 'ai-practitioner',
      analysis: { summary: 'Already analyzed.' },
      model: 'stored-model',
    }));

    const response = await POST(request({
      action: 'explain',
      evidenceId,
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
