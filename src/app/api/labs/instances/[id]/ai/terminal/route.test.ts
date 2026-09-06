import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';

const mocks = vi.hoisted(() => ({
  requireAuth: vi.fn(),
  validateCsrfToken: vi.fn(),
  checkRateLimit: vi.fn(),
  poolQuery: vi.fn(),
  authorizeTerminalEvidence: vi.fn(),
  recordBrowserObservedEvidence: vi.fn(),
}));

vi.mock('server-only', () => ({}));
vi.mock('@/lib/auth/middleware', () => ({ requireAuth: mocks.requireAuth }));
vi.mock('@/lib/security/csrf', () => ({ validateCsrfToken: mocks.validateCsrfToken }));
vi.mock('@/lib/security/rate-limit', () => ({ checkRateLimit: mocks.checkRateLimit }));
vi.mock('@/lib/db/pool', () => ({ getPool: () => ({ query: mocks.poolQuery }) }));
vi.mock('@/lib/ai-practitioner/server', () => ({
  truncatePractitionerEvidence: (value: string) => value,
  validatePractitionerCommand: () => ({ ok: true, risk: 'read-only' }),
}));
vi.mock('@/lib/execution-evidence/server', () => ({
  authorizeTerminalEvidence: mocks.authorizeTerminalEvidence,
  recordBrowserObservedEvidence: mocks.recordBrowserObservedEvidence,
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
  return new NextRequest(`http://localhost/api/labs/instances/${labId}/ai/terminal`, {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'content-type': 'application/json' },
  });
}

const context = { params: Promise.resolve({ id: labId }) };

describe('AI terminal execution evidence boundary', () => {
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
            status: 'running',
            runtime_provider: 'aws-ec2',
            runtime_external_id: 'i-123',
            slug: 'ubuntu-security-lab',
          }],
        };
      }
      if (sql.includes('INSERT INTO ai_practitioner_events')) return { rows: [] };
      throw new Error(`Unexpected SQL: ${sql.slice(0, 100)}`);
    });
    mocks.authorizeTerminalEvidence.mockResolvedValue({
      id: evidenceId,
      executionId,
      provenance: 'browser-observed',
      state: 'authorized',
      expiresAt: '2026-09-06T01:02:00.000Z',
    });
    mocks.recordBrowserObservedEvidence.mockResolvedValue({
      id: evidenceId,
      executionId,
      provenance: 'browser-observed',
      state: 'evidence_recorded',
      command: 'uname -a',
      stdout: 'stored output',
      stderr: '',
      exitCode: 0,
    });
  });

  it('keeps authentication as the outer boundary', async () => {
    mocks.requireAuth.mockResolvedValue(NextResponse.json({ error: 'Unauthorized' }, { status: 401 }));

    const response = await POST(request({ action: 'authorize', command: 'uname -a', approved: true }), context);

    expect(response.status).toBe(401);
    expect(mocks.validateCsrfToken).not.toHaveBeenCalled();
    expect(mocks.authorizeTerminalEvidence).not.toHaveBeenCalled();
  });

  it('returns the one-time execution and evidence identifiers on approval', async () => {
    const response = await POST(request({ action: 'authorize', command: 'uname -a', approved: true }), context);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(mocks.authorizeTerminalEvidence).toHaveBeenCalledWith(expect.objectContaining({
      ownerId: user.id,
      labInstanceId: labId,
      command: 'uname -a',
    }));
    expect(body.authorization).toMatchObject({
      executionId,
      evidenceId,
      provenance: 'browser-observed',
    });
  });

  it('records only through the one-time evidence service and returns its stored values', async () => {
    const response = await POST(request({
      action: 'record',
      command: 'uname -a',
      stdout: 'browser submitted value',
      stderr: '',
      exitCode: 0,
    }), context);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(mocks.recordBrowserObservedEvidence).toHaveBeenCalledWith(expect.objectContaining({
      ownerId: user.id,
      labInstanceId: labId,
      command: 'uname -a',
      stdout: 'browser submitted value',
    }));
    expect(body.execution).toMatchObject({
      stdout: 'stored output',
      executionId,
      evidenceId,
      provenance: 'browser-observed',
    });
  });

  it('rejects evidence recording when no active command receipt exists', async () => {
    const { ExecutionEvidenceConflictError } = await import('@/lib/execution-evidence/server');
    mocks.recordBrowserObservedEvidence.mockRejectedValue(
      new ExecutionEvidenceConflictError('No active one-time execution receipt matches this command and lab.', 'EXECUTION_RECEIPT_NOT_ACTIVE')
    );

    const response = await POST(request({
      action: 'record',
      command: 'uname -a',
      stdout: 'forged',
      stderr: '',
      exitCode: 0,
    }), context);
    const body = await response.json();

    expect(response.status).toBe(409);
    expect(body.code).toBe('EXECUTION_RECEIPT_NOT_ACTIVE');
  });
});
