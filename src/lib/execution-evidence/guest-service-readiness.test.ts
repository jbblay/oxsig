import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  poolQuery: vi.fn(),
  transaction: vi.fn(),
}));

vi.mock('server-only', () => ({}));
vi.mock('@/lib/db/pool', () => ({
  getPool: () => ({ query: mocks.poolQuery }),
  transaction: mocks.transaction,
}));

import {
  getGuestServiceReadinessEvidence,
  recordGuestServiceReadinessEvidence,
  storeGuestServiceReadinessAnalysis,
} from './guest-service-readiness';

const now = '2026-09-06T03:00:00.000Z';
const evidenceId = '11111111-1111-4111-8111-111111111111';
const labInstanceId = '22222222-2222-4222-8222-222222222222';
const authorizationId = '33333333-3333-4333-8333-333333333333';

function row(overrides: Record<string, unknown> = {}) {
  return {
    id: evidenceId,
    owner_id: 'user-1',
    lab_instance_id: labInstanceId,
    deployment_authorization_id: authorizationId,
    execution_id: '44444444-4444-4444-8444-444444444444',
    source: 'guest-service-readiness',
    surface: 'infrastructure-designer',
    provenance: 'server-executed',
    state: 'evidence_recorded',
    payload: { readiness: { state: 'ready' } },
    analysis_kind: null,
    analysis: null,
    model: null,
    evidence_recorded_at: now,
    analyzed_at: null,
    created_at: now,
    updated_at: now,
    ...overrides,
  };
}

describe('guest service readiness ledger', () => {
  beforeEach(() => vi.clearAllMocks());

  it('records a distinct server-executed guest-service observation', async () => {
    mocks.poolQuery.mockResolvedValue({ rows: [row()] });

    const result = await recordGuestServiceReadinessEvidence({
      ownerId: 'user-1',
      labInstanceId,
      deploymentAuthorizationId: authorizationId,
      payload: { readiness: { state: 'ready' } },
    });

    expect(result.source).toBe('guest-service-readiness');
    expect(result.provenance).toBe('server-executed');
    expect(result.state).toBe('evidence_recorded');
    expect(mocks.poolQuery).toHaveBeenCalledWith(
      expect.stringContaining("'guest-service-readiness'"),
      expect.arrayContaining(['user-1', labInstanceId, authorizationId])
    );
  });

  it('loads only owner-bound guest-service evidence for a lab', async () => {
    mocks.poolQuery.mockResolvedValue({ rows: [row()] });

    const result = await getGuestServiceReadinessEvidence({ ownerId: 'user-1', labInstanceId });

    expect(result.id).toBe(evidenceId);
    expect(mocks.poolQuery).toHaveBeenCalledWith(
      expect.stringContaining("source='guest-service-readiness'"),
      ['user-1', labInstanceId]
    );
  });

  it('persists one guest-service analysis and returns the stored record', async () => {
    const analyzed = row({
      state: 'analyzed',
      analysis_kind: 'guest-service-readiness',
      analysis: { summary: 'Guest service is ready.' },
      model: 'test-model',
      analyzed_at: now,
    });
    const query = vi.fn(async (sql: string) => {
      if (sql.includes('FOR UPDATE')) return { rows: [row()] };
      if (sql.includes("SET state='analyzed'")) return { rows: [analyzed] };
      throw new Error(`Unexpected SQL: ${sql.slice(0, 100)}`);
    });
    mocks.transaction.mockImplementation(async (handler) => handler({ query }));

    const result = await storeGuestServiceReadinessAnalysis({
      ownerId: 'user-1',
      evidenceId,
      analysis: { summary: 'Guest service is ready.' },
      model: 'test-model',
    });

    expect(result.state).toBe('analyzed');
    expect(result.analysisKind).toBe('guest-service-readiness');
    expect(result.analysis).toEqual({ summary: 'Guest service is ready.' });
  });

  it('returns the persisted winner if another request analyzed the record first', async () => {
    const winner = row({
      state: 'analyzed',
      analysis_kind: 'guest-service-readiness',
      analysis: { summary: 'Persisted winner.' },
      model: 'winner-model',
      analyzed_at: now,
    });
    const query = vi.fn(async (sql: string) => {
      if (sql.includes('FOR UPDATE')) return { rows: [row()] };
      if (sql.includes("SET state='analyzed'")) return { rows: [] };
      if (sql.includes('SELECT *') && sql.includes('LIMIT 1')) return { rows: [winner] };
      throw new Error(`Unexpected SQL: ${sql.slice(0, 100)}`);
    });
    mocks.transaction.mockImplementation(async (handler) => handler({ query }));

    const result = await storeGuestServiceReadinessAnalysis({
      ownerId: 'user-1',
      evidenceId,
      analysis: { summary: 'Losing proposal.' },
      model: 'loser-model',
    });

    expect(result.analysis).toEqual({ summary: 'Persisted winner.' });
    expect(result.model).toBe('winner-model');
  });
});
