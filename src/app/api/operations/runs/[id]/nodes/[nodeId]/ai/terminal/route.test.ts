import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';

const mocks = vi.hoisted(() => ({
  requireAuth: vi.fn(),
  validateCsrfToken: vi.fn(),
  checkRateLimit: vi.fn(),
  getPool: vi.fn(),
  sanitizePostgresText: vi.fn((value: string) => value),
  stringifyPostgresJson: vi.fn((value: unknown) => JSON.stringify(value)),
  validatePractitionerCommand: vi.fn(),
  truncatePractitionerEvidence: vi.fn((value: string) => value),
  authorizeEvidence: vi.fn(),
  beginEvidence: vi.fn(),
  recordEvidence: vi.fn(),
  verifySession: vi.fn(),
}));

vi.mock('@/lib/auth/middleware', () => ({ requireAuth: mocks.requireAuth }));
vi.mock('@/lib/security/csrf', () => ({ validateCsrfToken: mocks.validateCsrfToken }));
vi.mock('@/lib/security/rate-limit', () => ({ checkRateLimit: mocks.checkRateLimit }));
vi.mock('@/lib/db/pool', () => ({ getPool: mocks.getPool }));
vi.mock('@/lib/db/postgres-safe', () => ({
  sanitizePostgresText: mocks.sanitizePostgresText,
  stringifyPostgresJson: mocks.stringifyPostgresJson,
}));
vi.mock('@/lib/ai-practitioner/server', () => ({
  validatePractitionerCommand: mocks.validatePractitionerCommand,
  truncatePractitionerEvidence: mocks.truncatePractitionerEvidence,
}));
vi.mock('@/lib/execution-evidence/operation-terminal', () => ({
  authorizeOperationTerminalEvidence: mocks.authorizeEvidence,
  beginBoundOperationTerminalExecution: mocks.beginEvidence,
  recordBoundOperationTerminalEvidence: mocks.recordEvidence,
}));
vi.mock('@/lib/execution-evidence/server', () => ({
  ExecutionEvidenceConflictError: class ExecutionEvidenceConflictError extends Error {
    constructor(message: string, readonly code = 'EXECUTION_EVIDENCE_CONFLICT') { super(message); }
  },
}));
vi.mock('@/lib/labs/terminal-execution-session', () => ({
  TerminalExecutionSessionError: class TerminalExecutionSessionError extends Error {
    constructor(message: string, readonly code = 'TERMINAL_SESSION_INVALID') { super(message); }
  },
  verifyActiveTerminalExecutionSession: mocks.verifySession,
}));

import { POST } from './route';

const runId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const nodeId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const user = { id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc', clerkUserId: 'clerk-1', role: 'user' as const };
const runtimeExternalId = 'i-0123456789abcdef0';
const pool = { query: vi.fn() };

const activeNode = {
  id: nodeId,
  node_key: 'operator',
  label: 'Ubuntu Operator',
  role: 'operator' as const,
  os_family: 'ubuntu',
  status: 'running',
  runtime_provider: 'aws-ec2',
  runtime_external_id: runtimeExternalId,
  operation_slug: 'black-domain',
  mode: 'practice',
  run_status: 'running',
  expires_at: '2099-01-01T00:00:00.000Z',
  run_metadata: {},
};

function request(body: unknown) {
  return new NextRequest(`http://localhost/api/operations/runs/${runId}/nodes/${nodeId}/ai/terminal`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

function context() {
  return { params: Promise.resolve({ id: runId, nodeId }) };
}

describe('Operation AI Practitioner terminal API', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireAuth.mockImplementation(async (
      req: NextRequest,
      handler: (req: NextRequest, currentUser: typeof user) => Promise<NextResponse>
    ) => handler(req, user));
    mocks.validateCsrfToken.mockResolvedValue(true);
    mocks.checkRateLimit.mockResolvedValue(null);
    mocks.getPool.mockReturnValue(pool);
    mocks.validatePractitionerCommand.mockReturnValue({ ok: true, risk: 'read-only' });
    mocks.authorizeEvidence.mockResolvedValue({
      id: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
      executionId: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
      expiresAt: '2099-01-01T00:02:00.000Z',
      provenance: 'browser-observed',
    });
    mocks.verifySession.mockResolvedValue({ sessionId: 'session-black-domain-1', target: runtimeExternalId });
    mocks.beginEvidence.mockResolvedValue({
      id: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
      executionId: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
      executionReceiptId: 'ffffffff-ffff-4fff-8fff-ffffffffffff',
      terminalSessionId: 'session-black-domain-1',
      expiresAt: '2099-01-01T00:01:30.000Z',
      provenance: 'browser-observed',
    });
  });

  it('requires an explicit approval literal before creating any execution authorization', async () => {
    const response = await POST(request({
      action: 'authorize',
      surface: 'ai-practitioner',
      command: 'whoami',
    }), context());

    expect(response.status).toBe(400);
    expect(mocks.authorizeEvidence).not.toHaveBeenCalled();
    expect(pool.query).not.toHaveBeenCalled();
  });

  it('denies Practitioner execution in War Room before issuing evidence or touching a session', async () => {
    pool.query.mockResolvedValueOnce({ rows: [{ ...activeNode, mode: 'warroom' }] });

    const response = await POST(request({
      action: 'authorize',
      surface: 'ai-practitioner',
      command: 'whoami',
      approved: true,
    }), context());

    expect(response.status).toBe(403);
    expect(await response.json()).toMatchObject({ error: expect.stringContaining('War Room') });
    expect(mocks.authorizeEvidence).not.toHaveBeenCalled();
    expect(mocks.verifySession).not.toHaveBeenCalled();
  });

  it('binds approval evidence to the authenticated owner and exact Operation run and node', async () => {
    pool.query
      .mockResolvedValueOnce({ rows: [activeNode] })
      .mockResolvedValueOnce({ rows: [] });

    const response = await POST(request({
      action: 'authorize',
      surface: 'ai-practitioner',
      command: 'whoami',
      approved: true,
    }), context());

    expect(response.status).toBe(200);
    expect(mocks.authorizeEvidence).toHaveBeenCalledWith(expect.objectContaining({
      ownerId: user.id,
      runId,
      nodeId,
      command: 'whoami',
    }));
    expect(await response.json()).toMatchObject({
      authorization: {
        operationRunId: runId,
        operationNodeId: nodeId,
        executionId: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
      },
    });
  });

  it('binds execution start to the exact active SSM terminal session for the selected node', async () => {
    pool.query.mockResolvedValueOnce({ rows: [activeNode] });

    const response = await POST(request({
      action: 'begin',
      surface: 'ai-practitioner',
      executionId: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
      command: 'hostname',
      sessionId: 'session-black-domain-1',
    }), context());

    expect(response.status).toBe(200);
    expect(mocks.verifySession).toHaveBeenCalledWith(runtimeExternalId, 'session-black-domain-1');
    expect(mocks.beginEvidence).toHaveBeenCalledWith({
      ownerId: user.id,
      runId,
      nodeId,
      executionId: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
      command: 'hostname',
      terminalSessionId: 'session-black-domain-1',
      target: runtimeExternalId,
    });
    expect(await response.json()).toMatchObject({
      receipt: {
        executionReceiptId: 'ffffffff-ffff-4fff-8fff-ffffffffffff',
        sessionId: 'session-black-domain-1',
        provenance: 'browser-observed',
      },
    });
  });
});
