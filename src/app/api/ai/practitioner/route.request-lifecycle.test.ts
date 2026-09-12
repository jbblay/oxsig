import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';

const mocks = vi.hoisted(() => ({
  requireAuth: vi.fn(),
  validateCsrfToken: vi.fn(),
  checkRateLimit: vi.fn(),
  poolQuery: vi.fn(),
  planPractitionerStep: vi.fn(),
}));

vi.mock('server-only', () => ({}));
vi.mock('@/lib/auth/middleware', () => ({ requireAuth: mocks.requireAuth }));
vi.mock('@/lib/security/csrf', () => ({ validateCsrfToken: mocks.validateCsrfToken }));
vi.mock('@/lib/security/rate-limit', () => ({ checkRateLimit: mocks.checkRateLimit }));
vi.mock('@/lib/db/pool', () => ({ getPool: () => ({ query: mocks.poolQuery }) }));
vi.mock('@/lib/ai-practitioner/server', () => ({
  aiPractitionerConfigured: () => true,
  aiPractitionerModel: () => 'test-model',
  aiPractitionerPlanSchema: {
    safeParse: (value: unknown) => ({ success: true, data: value }),
  },
  explainPractitionerEvidence: vi.fn(),
  planPractitionerStep: mocks.planPractitionerStep,
  practitionerRequestSchema: {
    safeParse: (value: unknown) => ({ success: true, data: value }),
  },
}));
vi.mock('@/lib/execution-evidence/server', () => ({
  getTerminalEvidenceForAnalysis: vi.fn(),
  storeExecutionEvidenceAnalysis: vi.fn(),
  ExecutionEvidenceConflictError: class ExecutionEvidenceConflictError extends Error {
    constructor(message: string, readonly code: string) {
      super(message);
    }
  },
}));

import { AiRequestTimeoutError } from '@/lib/ai/providers/server';
import { POST } from './route';

const user = { id: 'user-1', clerkUserId: 'clerk-1', role: 'user' as const };
const requestId = '11111111-1111-4111-8111-111111111111';
const plan = {
  title: 'Explain COW',
  explanation: 'Copy-on-write defers copying memory pages until one side writes.',
  objective: 'Explain copy-on-write',
  command: null,
  expected: 'No execution is required',
  risk: 'read-only' as const,
  approvalReason: 'No execution is required.',
  nextConcept: 'Page faults',
};

function request() {
  return new NextRequest('http://localhost/api/ai/practitioner', {
    method: 'POST',
    body: JSON.stringify({
      action: 'plan',
      requestId,
      prompt: 'Explain copy-on-write',
      history: [],
    }),
    headers: { 'content-type': 'application/json' },
  });
}

function persistedRow() {
  return {
    lab_instance_id: null,
    prompt: 'Explain copy-on-write',
    model: 'test-model',
    metadata: { requestId, plan },
  };
}

describe('AI Practitioner request idempotency and failure mapping', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireAuth.mockImplementation(async (
      req: NextRequest,
      handler: (req: NextRequest, currentUser: typeof user) => Promise<NextResponse>
    ) => handler(req, user));
    mocks.validateCsrfToken.mockResolvedValue(true);
    mocks.checkRateLimit.mockResolvedValue(null);
    mocks.planPractitionerStep.mockResolvedValue(plan);
  });

  it('persists a successful logical request once with its stable request ID', async () => {
    mocks.poolQuery.mockImplementation(async (sql: string, params: unknown[]) => {
      if (sql.includes("metadata->>'requestId'")) return { rows: [] };
      if (sql.includes('INSERT INTO ai_practitioner_events') && sql.includes('RETURNING id')) {
        expect(String(params[5])).toContain(requestId);
        return { rows: [{ id: 'plan-1' }] };
      }
      throw new Error(`Unexpected SQL: ${sql.slice(0, 120)}`);
    });

    const response = await POST(request());
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.plan).toEqual(plan);
    expect(body.requestId).toBe(requestId);
    expect(mocks.planPractitionerStep).toHaveBeenCalledTimes(1);
    expect(mocks.poolQuery).toHaveBeenCalledWith(expect.stringContaining('ON CONFLICT DO NOTHING'), expect.any(Array));
  });

  it('replays an already persisted retry without generating or inserting another turn', async () => {
    mocks.poolQuery.mockImplementation(async (sql: string) => {
      if (sql.includes("metadata->>'requestId'")) return { rows: [persistedRow()] };
      throw new Error(`Unexpected SQL: ${sql.slice(0, 120)}`);
    });

    const response = await POST(request());
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.replayed).toBe(true);
    expect(body.plan).toEqual(plan);
    expect(mocks.planPractitionerStep).not.toHaveBeenCalled();
    expect(mocks.poolQuery).toHaveBeenCalledTimes(1);
  });

  it('resolves a persistence race by replaying the single winning turn', async () => {
    let lookupCount = 0;
    mocks.poolQuery.mockImplementation(async (sql: string) => {
      if (sql.includes("metadata->>'requestId'")) {
        lookupCount += 1;
        return { rows: lookupCount === 1 ? [] : [persistedRow()] };
      }
      if (sql.includes('INSERT INTO ai_practitioner_events') && sql.includes('RETURNING id')) {
        return { rows: [] };
      }
      throw new Error(`Unexpected SQL: ${sql.slice(0, 120)}`);
    });

    const response = await POST(request());
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.replayed).toBe(true);
    expect(mocks.planPractitionerStep).toHaveBeenCalledTimes(1);
    expect(lookupCount).toBe(2);
  });

  it('maps provider deadline expiry to a retryable timeout without persisting a turn', async () => {
    mocks.poolQuery.mockImplementation(async (sql: string) => {
      if (sql.includes("metadata->>'requestId'")) return { rows: [] };
      throw new Error(`Unexpected SQL: ${sql.slice(0, 120)}`);
    });
    mocks.planPractitionerStep.mockRejectedValue(new AiRequestTimeoutError(25));

    const response = await POST(request());
    const body = await response.json();

    expect(response.status).toBe(504);
    expect(body.code).toBe('AI_REQUEST_TIMEOUT');
    expect(body.error).toContain('timed out');
    expect(mocks.poolQuery).toHaveBeenCalledTimes(1);
  });

  it('keeps ordinary provider failure distinct from timeout', async () => {
    mocks.poolQuery.mockImplementation(async (sql: string) => {
      if (sql.includes("metadata->>'requestId'")) return { rows: [] };
      throw new Error(`Unexpected SQL: ${sql.slice(0, 120)}`);
    });
    mocks.planPractitionerStep.mockRejectedValue(new Error('provider unavailable'));

    const response = await POST(request());
    const body = await response.json();

    expect(response.status).toBe(502);
    expect(body.error).toBe('provider unavailable');
    expect(body.code).toBeUndefined();
  });
});
