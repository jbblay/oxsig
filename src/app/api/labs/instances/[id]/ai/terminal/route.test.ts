import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';

const mocks = vi.hoisted(() => ({
  requireAuth: vi.fn(),
  validateCsrfToken: vi.fn(),
  checkRateLimit: vi.fn(),
  poolQuery: vi.fn(),
  authorizeTerminalEvidence: vi.fn(),
  verifyActiveTerminalExecutionSession: vi.fn(),
  beginBoundTerminalExecution: vi.fn(),
  recordBoundTerminalEvidence: vi.fn(),
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
  ExecutionEvidenceConflictError: class ExecutionEvidenceConflictError extends Error {
    constructor(message: string, readonly code: string) {
      super(message);
    }
  },
}));
vi.mock('@/lib/execution-evidence/terminal-execution-receipt', () => ({
  beginBoundTerminalExecution: mocks.beginBoundTerminalExecution,
  recordBoundTerminalEvidence: mocks.recordBoundTerminalEvidence,
}));
vi.mock('@/lib/labs/terminal-execution-session', () => ({
  verifyActiveTerminalExecutionSession: mocks.verifyActiveTerminalExecutionSession,
  TerminalExecutionSessionError: class TerminalExecutionSessionError extends Error {
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
const receiptId = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
const sessionId = 'jbblay-session-abc123';

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
      expiresAt: '2099-09-06T01:02:00.000Z',
    });
    mocks.verifyActiveTerminalExecutionSession.mockResolvedValue({
      sessionId,
      target: 'i-123',
      owner: 'user',
      startedAt: '2026-09-06T01:00:00.000Z',
      region: 'eu-central-1',
    });
    mocks.beginBoundTerminalExecution.mockResolvedValue({
      id: evidenceId,
      executionId,
      surface: 'ai-practitioner',
      provenance: 'browser-observed',
      state: 'executing',
      executionReceiptId: receiptId,
      terminalSessionId: sessionId,
      expiresAt: '2099-09-06T01:02:00.000Z',
    });
    mocks.recordBoundTerminalEvidence.mockResolvedValue({
      id: evidenceId,
      executionId,
      surface: 'ai-practitioner',
      provenance: 'browser-observed',
      state: 'evidence_recorded',
      command: 'uname -a',
      stdout: 'stored output',
      stderr: '',
      exitCode: 0,
      executionReceiptId: receiptId,
      terminalSessionId: sessionId,
    });
  });

  it('keeps authentication as the outer boundary', async () => {
    mocks.requireAuth.mockResolvedValue(NextResponse.json({ error: 'Unauthorized' }, { status: 401 }));

    const response = await POST(request({
      action: 'authorize',
      surface: 'ai-practitioner',
      command: 'uname -a',
      approved: true,
    }), context);

    expect(response.status).toBe(401);
    expect(mocks.validateCsrfToken).not.toHaveBeenCalled();
    expect(mocks.authorizeTerminalEvidence).not.toHaveBeenCalled();
  });

  it('authorizes the exact learning surface and returns the one-time execution identity', async () => {
    const response = await POST(request({
      action: 'authorize',
      surface: 'academy',
      command: 'uname -a',
      approved: true,
    }), context);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(mocks.authorizeTerminalEvidence).toHaveBeenCalledWith(expect.objectContaining({
      ownerId: user.id,
      labInstanceId: labId,
      command: 'uname -a',
      surface: 'academy',
    }));
    expect(body.authorization).toMatchObject({
      executionId,
      evidenceId,
      provenance: 'browser-observed',
      surface: 'academy',
    });
    expect(mocks.poolQuery).toHaveBeenCalledTimes(1);
  });

  it('verifies the exact active SSM session before consuming the authorized execution', async () => {
    const response = await POST(request({
      action: 'begin',
      surface: 'ai-practitioner',
      executionId,
      command: 'uname -a',
      sessionId,
    }), context);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(mocks.verifyActiveTerminalExecutionSession).toHaveBeenCalledWith('i-123', sessionId);
    expect(mocks.beginBoundTerminalExecution).toHaveBeenCalledWith({
      ownerId: user.id,
      labInstanceId: labId,
      executionId,
      surface: 'ai-practitioner',
      command: 'uname -a',
      terminalSessionId: sessionId,
      target: 'i-123',
    });
    expect(body.receipt).toMatchObject({
      executionId,
      evidenceId,
      executionReceiptId: receiptId,
      sessionId,
      provenance: 'browser-observed',
    });
  });

  it('does not consume the authorized execution when the SSM session cannot be verified', async () => {
    const { TerminalExecutionSessionError } = await import('@/lib/labs/terminal-execution-session');
    mocks.verifyActiveTerminalExecutionSession.mockRejectedValue(
      new TerminalExecutionSessionError('The terminal session does not belong to this lab runtime.', 'TERMINAL_SESSION_TARGET_MISMATCH')
    );

    const response = await POST(request({
      action: 'begin',
      surface: 'ai-practitioner',
      executionId,
      command: 'uname -a',
      sessionId,
    }), context);
    const body = await response.json();

    expect(response.status).toBe(409);
    expect(body.code).toBe('TERMINAL_SESSION_TARGET_MISMATCH');
    expect(mocks.beginBoundTerminalExecution).not.toHaveBeenCalled();
  });

  it('records only against the exact execution receipt and terminal session', async () => {
    const response = await POST(request({
      action: 'record',
      surface: 'ai-practitioner',
      executionId,
      executionReceiptId: receiptId,
      sessionId,
      command: 'uname -a',
      stdout: 'browser submitted value',
      stderr: '',
      exitCode: 0,
    }), context);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(mocks.recordBoundTerminalEvidence).toHaveBeenCalledWith({
      ownerId: user.id,
      labInstanceId: labId,
      executionId,
      executionReceiptId: receiptId,
      terminalSessionId: sessionId,
      surface: 'ai-practitioner',
      command: 'uname -a',
      stdout: 'browser submitted value',
      stderr: '',
      exitCode: 0,
    });
    expect(body.execution).toMatchObject({
      stdout: 'stored output',
      executionId,
      evidenceId,
      executionReceiptId: receiptId,
      terminalSessionId: sessionId,
      provenance: 'browser-observed',
    });
  });

  it('rejects legacy command-only recording before touching the evidence ledger', async () => {
    const response = await POST(request({
      action: 'record',
      surface: 'ai-practitioner',
      command: 'uname -a',
      stdout: 'forged',
      stderr: '',
      exitCode: 0,
    }), context);

    expect(response.status).toBe(400);
    expect(mocks.recordBoundTerminalEvidence).not.toHaveBeenCalled();
  });

  it('returns receipt conflicts without weakening the one-time boundary', async () => {
    const { ExecutionEvidenceConflictError } = await import('@/lib/execution-evidence/server');
    mocks.recordBoundTerminalEvidence.mockRejectedValue(
      new ExecutionEvidenceConflictError('The one-time execution receipt does not match this run.', 'EXECUTION_RECEIPT_MISMATCH')
    );

    const response = await POST(request({
      action: 'record',
      surface: 'ai-practitioner',
      executionId,
      executionReceiptId: receiptId,
      sessionId,
      command: 'uname -a',
      stdout: 'forged',
      stderr: '',
      exitCode: 0,
    }), context);
    const body = await response.json();

    expect(response.status).toBe(409);
    expect(body.code).toBe('EXECUTION_RECEIPT_MISMATCH');
  });
});
