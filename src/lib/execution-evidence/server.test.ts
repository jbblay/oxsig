import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  transaction: vi.fn(),
  poolQuery: vi.fn(),
}));

vi.mock('server-only', () => ({}));
vi.mock('@/lib/db/pool', () => ({
  transaction: mocks.transaction,
  getPool: () => ({ query: mocks.poolQuery }),
}));

import {
  authorizeTerminalEvidence,
  executionCommandHash,
  getTerminalEvidenceForAnalysis,
  recordBrowserObservedEvidence,
  recordProviderAttestedDeploymentEvidence,
  storeExecutionEvidenceAnalysis,
} from './server';

const now = '2026-09-06T01:00:00.000Z';
const later = '2026-09-06T01:02:00.000Z';
const evidenceId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const executionId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const labId = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';

function terminalRow(overrides: Record<string, unknown> = {}) {
  return {
    id: evidenceId,
    owner_id: 'user-1',
    lab_instance_id: labId,
    deployment_authorization_id: null,
    execution_id: executionId,
    source: 'interactive-terminal',
    surface: 'ai-practitioner',
    provenance: 'browser-observed',
    state: 'authorized',
    command_hash: executionCommandHash('uname -a'),
    command: 'uname -a',
    stdout: null,
    stderr: null,
    exit_code: null,
    payload: {},
    analysis_kind: null,
    analysis: null,
    model: null,
    expires_at: later,
    execution_started_at: null,
    evidence_recorded_at: null,
    analyzed_at: null,
    created_at: now,
    updated_at: now,
    ...overrides,
  };
}

describe('execution evidence lifecycle', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('hashes normalized commands deterministically', () => {
    expect(executionCommandHash(' uname -a ')).toBe(executionCommandHash('uname -a'));
    expect(executionCommandHash('uname -a')).toMatch(/^[a-f0-9]{64}$/);
    expect(executionCommandHash('uname -a')).not.toBe(executionCommandHash('id'));
  });

  it('issues a short-lived browser-observed one-time terminal receipt', async () => {
    const query = vi.fn(async (sql: string) => {
      if (sql.includes('UPDATE execution_evidence')) return { rows: [] };
      if (sql.includes('INSERT INTO execution_evidence')) return { rows: [terminalRow()] };
      throw new Error(`Unexpected SQL: ${sql.slice(0, 80)}`);
    });
    mocks.transaction.mockImplementation(async (handler) => handler({ query }));

    const record = await authorizeTerminalEvidence({
      ownerId: 'user-1',
      labInstanceId: labId,
      command: ' uname -a ',
      surface: 'ai-practitioner',
      metadata: { risk: 'read-only' },
    });

    expect(record.provenance).toBe('browser-observed');
    expect(record.state).toBe('authorized');
    expect(record.command).toBe('uname -a');
    expect(query).toHaveBeenCalledWith(
      expect.stringContaining("'browser-observed'"),
      expect.arrayContaining(['user-1', labId, 'ai-practitioner'])
    );
  });

  it('moves authorized terminal evidence through executing to evidence-recorded exactly once', async () => {
    const recorded = terminalRow({
      state: 'evidence_recorded',
      stdout: 'Linux lab',
      stderr: '',
      exit_code: 0,
      execution_started_at: now,
      evidence_recorded_at: now,
    });
    const query = vi.fn(async (sql: string) => {
      if (sql.includes("state='expired'")) return { rows: [] };
      if (sql.includes('SELECT *') && sql.includes('FOR UPDATE')) return { rows: [terminalRow()] };
      if (sql.includes("state='executing'")) return { rows: [{ id: evidenceId }] };
      if (sql.includes("state='evidence_recorded'")) return { rows: [recorded] };
      throw new Error(`Unexpected SQL: ${sql.slice(0, 100)}`);
    });
    mocks.transaction.mockImplementation(async (handler) => handler({ query }));

    const evidence = await recordBrowserObservedEvidence({
      ownerId: 'user-1',
      labInstanceId: labId,
      command: 'uname -a',
      executionId,
      stdout: 'Linux lab',
      stderr: '',
      exitCode: 0,
    });

    expect(evidence.state).toBe('evidence_recorded');
    expect(evidence.stdout).toBe('Linux lab');
    expect(evidence.provenance).toBe('browser-observed');
  });

  it('loads server-stored terminal evidence for AI analysis instead of trusting request output', async () => {
    mocks.poolQuery.mockResolvedValue({
      rows: [terminalRow({
        state: 'evidence_recorded',
        stdout: 'server-stored-output',
        stderr: '',
        exit_code: 0,
        evidence_recorded_at: now,
      })],
    });

    const evidence = await getTerminalEvidenceForAnalysis({
      ownerId: 'user-1',
      labInstanceId: labId,
      command: 'uname -a',
      surface: 'ai-practitioner',
    });

    expect(evidence.stdout).toBe('server-stored-output');
    expect(mocks.poolQuery).toHaveBeenCalledWith(
      expect.stringContaining("state IN ('evidence_recorded','analyzed')"),
      expect.arrayContaining(['user-1', 'ai-practitioner', executionCommandHash('uname -a'), labId])
    );
  });

  it('stores one analysis and makes analyzed evidence idempotently readable', async () => {
    const analyzed = terminalRow({
      state: 'analyzed',
      stdout: 'Linux lab',
      exit_code: 0,
      evidence_recorded_at: now,
      analyzed_at: now,
      analysis_kind: 'ai-practitioner',
      analysis: { summary: 'Linux kernel details were returned.' },
      model: 'test-model',
    });
    const query = vi.fn(async (sql: string) => {
      if (sql.includes('SELECT *') && sql.includes('FOR UPDATE')) {
        return { rows: [terminalRow({ state: 'evidence_recorded', evidence_recorded_at: now })] };
      }
      if (sql.includes("state='analyzed'")) return { rows: [analyzed] };
      throw new Error(`Unexpected SQL: ${sql.slice(0, 100)}`);
    });
    mocks.transaction.mockImplementation(async (handler) => handler({ query }));

    const result = await storeExecutionEvidenceAnalysis({
      ownerId: 'user-1',
      evidenceId,
      analysisKind: 'ai-practitioner',
      analysis: { summary: 'Linux kernel details were returned.' },
      model: 'test-model',
    });

    expect(result.state).toBe('analyzed');
    expect(result.analysisKind).toBe('ai-practitioner');
    expect(result.analysis).toEqual({ summary: 'Linux kernel details were returned.' });
  });

  it('records provider-attested deployment evidence and advances the authorization state', async () => {
    const deploymentEvidence = terminalRow({
      deployment_authorization_id: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
      source: 'deployment',
      surface: 'infrastructure-designer',
      provenance: 'provider-attested',
      state: 'evidence_recorded',
      command_hash: null,
      command: null,
      payload: { externalId: 'i-123', region: 'eu-central-1' },
      evidence_recorded_at: now,
      expires_at: null,
    });
    const query = vi.fn(async (sql: string) => {
      if (sql.includes('SELECT *') && sql.includes('execution_id')) return { rows: [] };
      if (sql.includes('INSERT INTO execution_evidence')) return { rows: [deploymentEvidence] };
      if (sql.includes('UPDATE deployment_authorizations')) return { rows: [{ id: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd' }] };
      throw new Error(`Unexpected SQL: ${sql.slice(0, 100)}`);
    });
    mocks.transaction.mockImplementation(async (handler) => handler({ query }));

    const result = await recordProviderAttestedDeploymentEvidence({
      ownerId: 'user-1',
      labInstanceId: labId,
      deploymentAuthorizationId: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
      executionId,
      payload: { externalId: 'i-123', region: 'eu-central-1' },
    });

    expect(result.provenance).toBe('provider-attested');
    expect(result.state).toBe('evidence_recorded');
    expect(query).toHaveBeenCalledWith(
      expect.stringContaining("SET state='evidence_recorded'"),
      expect.arrayContaining(['dddddddd-dddd-4ddd-8ddd-dddddddddddd', 'user-1', executionId, labId])
    );
  });
});
