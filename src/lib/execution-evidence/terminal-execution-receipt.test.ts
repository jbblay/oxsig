import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ transaction: vi.fn() }));

vi.mock('server-only', () => ({}));
vi.mock('@/lib/db/pool', () => ({ transaction: mocks.transaction }));

import {
  beginBoundTerminalExecution,
  recordBoundTerminalEvidence,
} from './terminal-execution-receipt';

const evidenceId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const executionId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const labId = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const sessionId = 'jbblay-session-abc123';
const receiptId = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';

function row(overrides: Record<string, unknown> = {}) {
  return {
    id: evidenceId,
    owner_id: 'user-1',
    lab_instance_id: labId,
    execution_id: executionId,
    source: 'interactive-terminal',
    surface: 'ai-practitioner',
    provenance: 'browser-observed',
    state: 'authorized',
    command_hash: 'hash',
    command: 'uname -a',
    stdout: null,
    stderr: null,
    exit_code: null,
    payload: {},
    expires_at: '2099-09-06T05:00:00.000Z',
    execution_started_at: null,
    evidence_recorded_at: null,
    created_at: '2026-09-06T04:00:00.000Z',
    updated_at: '2026-09-06T04:00:00.000Z',
    ...overrides,
  };
}

describe('bound terminal execution receipt lifecycle', () => {
  beforeEach(() => vi.clearAllMocks());

  it('atomically binds an authorized execution to the exact terminal session', async () => {
    const query = vi.fn(async (sql: string, params?: unknown[]) => {
      if (sql.includes("SET state='expired'")) return { rows: [] };
      if (sql.includes("state='authorized'") && sql.includes('FOR UPDATE')) return { rows: [row()] };
      if (sql.includes("SET state='executing'")) {
        const binding = JSON.parse(String(params?.[1] || '{}'));
        return {
          rows: [row({
            state: 'executing',
            payload: binding,
            execution_started_at: '2026-09-06T04:01:00.000Z',
            expires_at: '2099-09-06T05:00:00.000Z',
          })],
        };
      }
      throw new Error(`Unexpected SQL: ${sql.slice(0, 100)}`);
    });
    mocks.transaction.mockImplementation(async (handler) => handler({ query }));

    const result = await beginBoundTerminalExecution({
      ownerId: 'user-1',
      labInstanceId: labId,
      executionId,
      surface: 'ai-practitioner',
      command: 'uname -a',
      terminalSessionId: sessionId,
      target: 'i-0123456789abcdef0',
    });

    expect(result.state).toBe('executing');
    expect(result.executionReceiptId).toMatch(/^[0-9a-f-]{36}$/i);
    expect(result.terminalSessionId).toBe(sessionId);
    expect(query).toHaveBeenCalledWith(
      expect.stringContaining("SET state='executing'"),
      expect.arrayContaining([90, expect.any(String), evidenceId, 'user-1'])
    );
    const executingCall = query.mock.calls.find(([sql]) => String(sql).includes("SET state='executing'"));
    const binding = JSON.parse(String(executingCall?.[1]?.[1]));
    expect(binding).toMatchObject({
      terminalSessionId: sessionId,
      terminalTarget: 'i-0123456789abcdef0',
    });
  });

  it('rejects evidence recorded with another one-time receipt', async () => {
    const query = vi.fn(async (sql: string) => {
      if (sql.includes('FOR UPDATE')) return {
        rows: [row({
          state: 'executing',
          payload: { executionReceiptId: receiptId, terminalSessionId: sessionId },
        })],
      };
      throw new Error(`Unexpected SQL: ${sql.slice(0, 100)}`);
    });
    mocks.transaction.mockImplementation(async (handler) => handler({ query }));

    await expect(recordBoundTerminalEvidence({
      ownerId: 'user-1',
      labInstanceId: labId,
      executionId,
      executionReceiptId: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
      terminalSessionId: sessionId,
      surface: 'ai-practitioner',
      command: 'uname -a',
      stdout: 'forged',
      stderr: '',
      exitCode: 0,
    })).rejects.toMatchObject({ code: 'EXECUTION_RECEIPT_MISMATCH' });
  });

  it('rejects evidence recorded from another terminal session', async () => {
    const query = vi.fn(async (sql: string) => {
      if (sql.includes('FOR UPDATE')) return {
        rows: [row({
          state: 'executing',
          payload: { executionReceiptId: receiptId, terminalSessionId: sessionId },
        })],
      };
      throw new Error(`Unexpected SQL: ${sql.slice(0, 100)}`);
    });
    mocks.transaction.mockImplementation(async (handler) => handler({ query }));

    await expect(recordBoundTerminalEvidence({
      ownerId: 'user-1',
      labInstanceId: labId,
      executionId,
      executionReceiptId: receiptId,
      terminalSessionId: 'another-session',
      surface: 'ai-practitioner',
      command: 'uname -a',
      stdout: 'forged',
      stderr: '',
      exitCode: 0,
    })).rejects.toMatchObject({ code: 'EXECUTION_SESSION_MISMATCH' });
  });

  it('returns the first stored observation on retry instead of overwriting evidence', async () => {
    const stored = row({
      state: 'evidence_recorded',
      payload: { executionReceiptId: receiptId, terminalSessionId: sessionId },
      stdout: 'first observation',
      stderr: '',
      exit_code: 0,
      evidence_recorded_at: '2026-09-06T04:02:00.000Z',
    });
    const query = vi.fn(async (sql: string) => {
      if (sql.includes('FOR UPDATE')) return { rows: [stored] };
      throw new Error(`Retry must not write again: ${sql.slice(0, 100)}`);
    });
    mocks.transaction.mockImplementation(async (handler) => handler({ query }));

    const result = await recordBoundTerminalEvidence({
      ownerId: 'user-1',
      labInstanceId: labId,
      executionId,
      executionReceiptId: receiptId,
      terminalSessionId: sessionId,
      surface: 'ai-practitioner',
      command: 'uname -a',
      stdout: 'second observation',
      stderr: 'different',
      exitCode: 9,
    });

    expect(result.stdout).toBe('first observation');
    expect(result.exitCode).toBe(0);
    expect(query).toHaveBeenCalledTimes(1);
  });

  it('expires an executing receipt instead of accepting late browser evidence', async () => {
    const expired = row({
      state: 'executing',
      payload: { executionReceiptId: receiptId, terminalSessionId: sessionId },
      expires_at: '2000-01-01T00:00:00.000Z',
    });
    const query = vi.fn(async (sql: string) => {
      if (sql.includes('FOR UPDATE')) return { rows: [expired] };
      if (sql.includes("SET state='expired'")) return { rows: [] };
      throw new Error(`Unexpected SQL: ${sql.slice(0, 100)}`);
    });
    mocks.transaction.mockImplementation(async (handler) => handler({ query }));

    await expect(recordBoundTerminalEvidence({
      ownerId: 'user-1',
      labInstanceId: labId,
      executionId,
      executionReceiptId: receiptId,
      terminalSessionId: sessionId,
      surface: 'ai-practitioner',
      command: 'uname -a',
      stdout: 'late',
      stderr: '',
      exitCode: 0,
    })).rejects.toMatchObject({ code: 'EXECUTION_RECEIPT_EXPIRED' });

    expect(query).toHaveBeenCalledWith(
      expect.stringContaining("SET state='expired'"),
      [evidenceId, 'user-1']
    );
  });
});
