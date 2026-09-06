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
  AccessPathReadinessEvidenceConflictError,
  getAccessPathReadinessEvidence,
  recordAccessPathReadinessEvidence,
  storeAccessPathReadinessAnalysis,
} from './access-path-readiness';

const now = '2026-09-06T03:20:00.000Z';
const evidenceId = '11111111-1111-4111-8111-111111111111';
const labInstanceId = '22222222-2222-4222-8222-222222222222';
const authorizationId = '33333333-3333-4333-8333-333333333333';
const executionId = '44444444-4444-4444-8444-444444444444';

function row(overrides: Record<string, unknown> = {}) {
  return {
    id: evidenceId,
    owner_id: 'user-1',
    lab_instance_id: labInstanceId,
    deployment_authorization_id: authorizationId,
    execution_id: executionId,
    source: 'access-path-readiness',
    surface: 'browser-desktop',
    provenance: 'browser-observed',
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

describe('browser access-path evidence ledger', () => {
  beforeEach(() => vi.clearAllMocks());

  it('records browser-observed access evidence with the ticket execution ID', async () => {
    mocks.poolQuery.mockResolvedValueOnce({ rows: [row()] });

    const result = await recordAccessPathReadinessEvidence({
      ownerId: 'user-1',
      labInstanceId,
      deploymentAuthorizationId: authorizationId,
      executionId,
      payload: { readiness: { state: 'ready' } },
    });

    expect(result.provenance).toBe('browser-observed');
    expect(result.executionId).toBe(executionId);
    expect(mocks.poolQuery).toHaveBeenCalledWith(
      expect.stringContaining("'access-path-readiness'"),
      ['user-1', labInstanceId, authorizationId, executionId, expect.any(String)]
    );
  });

  it('returns the first persisted observation when the same ticket is delivered again', async () => {
    mocks.poolQuery
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [row({ payload: { desktopName: 'First observation' } })] });

    const result = await recordAccessPathReadinessEvidence({
      ownerId: 'user-1',
      labInstanceId,
      deploymentAuthorizationId: authorizationId,
      executionId,
      payload: { desktopName: 'Retry observation' },
    });

    expect(result.payload).toEqual({ desktopName: 'First observation' });
    expect(mocks.poolQuery).toHaveBeenCalledTimes(2);
  });

  it('rejects reuse of the ticket execution ID against another lab binding', async () => {
    mocks.poolQuery
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [row({ lab_instance_id: '55555555-5555-4555-8555-555555555555' })] });

    await expect(recordAccessPathReadinessEvidence({
      ownerId: 'user-1',
      labInstanceId,
      deploymentAuthorizationId: authorizationId,
      executionId,
      payload: {},
    })).rejects.toBeInstanceOf(AccessPathReadinessEvidenceConflictError);
  });

  it('loads only owner-bound browser access evidence for the lab', async () => {
    mocks.poolQuery.mockResolvedValue({ rows: [row()] });

    const result = await getAccessPathReadinessEvidence({ ownerId: 'user-1', labInstanceId });

    expect(result.id).toBe(evidenceId);
    expect(mocks.poolQuery).toHaveBeenCalledWith(
      expect.stringContaining("source='access-path-readiness'"),
      ['user-1', labInstanceId]
    );
  });

  it('returns the persisted analysis winner under concurrent interpretation', async () => {
    const winner = row({
      state: 'analyzed',
      analysis_kind: 'access-path-readiness',
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

    const result = await storeAccessPathReadinessAnalysis({
      ownerId: 'user-1',
      evidenceId,
      analysis: { summary: 'Losing proposal.' },
      model: 'loser-model',
    });

    expect(result.analysis).toEqual({ summary: 'Persisted winner.' });
    expect(result.model).toBe('winner-model');
  });
});
