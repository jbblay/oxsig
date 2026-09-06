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
  getRuntimeReadinessEvidence,
  recordRuntimeReadinessEvidence,
  storeRuntimeReadinessAnalysis,
} from './runtime-readiness';

const now = '2026-09-06T01:20:00.000Z';
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
    source: 'runtime-readiness',
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

describe('runtime readiness ledger', () => {
  beforeEach(() => vi.clearAllMocks());

  it('records a distinct server-executed readiness observation', async () => {
    mocks.poolQuery.mockResolvedValue({ rows: [row()] });

    const result = await recordRuntimeReadinessEvidence({
      ownerId: 'user-1',
      labInstanceId,
      deploymentAuthorizationId: authorizationId,
      payload: { readiness: { state: 'ready' } },
    });

    expect(result.source).toBe('runtime-readiness');
    expect(result.provenance).toBe('server-executed');
    expect(result.state).toBe('evidence_recorded');
    expect(mocks.poolQuery).toHaveBeenCalledWith(
      expect.stringContaining("'runtime-readiness'"),
      expect.arrayContaining(['user-1', labInstanceId, authorizationId])
    );
  });

  it('loads only owner-bound runtime readiness evidence for a lab', async () => {
    mocks.poolQuery.mockResolvedValue({ rows: [row()] });

    const result = await getRuntimeReadinessEvidence({ ownerId: 'user-1', labInstanceId });

    expect(result.id).toBe(evidenceId);
    expect(mocks.poolQuery).toHaveBeenCalledWith(
      expect.stringContaining("source='runtime-readiness'"),
      ['user-1', labInstanceId]
    );
  });

  it('persists one readiness analysis and returns the stored record', async () => {
    const analyzed = row({
      state: 'analyzed',
      analysis_kind: 'runtime-readiness',
      analysis: { summary: 'Management path is ready.' },
      model: 'test-model',
      analyzed_at: now,
    });
    const query = vi.fn(async (sql: string) => {
      if (sql.includes('FOR UPDATE')) return { rows: [row()] };
      if (sql.includes("SET state='analyzed'")) return { rows: [analyzed] };
      throw new Error(`Unexpected SQL: ${sql.slice(0, 100)}`);
    });
    mocks.transaction.mockImplementation(async (handler) => handler({ query }));

    const result = await storeRuntimeReadinessAnalysis({
      ownerId: 'user-1',
      evidenceId,
      analysis: { summary: 'Management path is ready.' },
      model: 'test-model',
    });

    expect(result.state).toBe('analyzed');
    expect(result.analysisKind).toBe('runtime-readiness');
    expect(result.analysis).toEqual({ summary: 'Management path is ready.' });
  });

  it('returns the persisted winner if another request analyzed the record first', async () => {
    const winner = row({
      state: 'analyzed',
      analysis_kind: 'runtime-readiness',
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

    const result = await storeRuntimeReadinessAnalysis({
      ownerId: 'user-1',
      evidenceId,
      analysis: { summary: 'Losing proposal.' },
      model: 'loser-model',
    });

    expect(result.analysis).toEqual({ summary: 'Persisted winner.' });
    expect(result.model).toBe('winner-model');
  });
});
