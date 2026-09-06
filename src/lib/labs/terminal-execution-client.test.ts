import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ getCsrfToken: vi.fn() }));

vi.mock('@/lib/security/csrf-client', () => ({ getCsrfToken: mocks.getCsrfToken }));

import {
  persistTerminalExecution,
  prepareTerminalExecution,
} from './terminal-execution-client';

const labId = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const executionId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const evidenceId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const receiptId = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
const sessionId = 'jbblay-session-abc123';

describe('terminal execution client lifecycle', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getCsrfToken.mockResolvedValue('csrf-token');
    vi.stubGlobal('fetch', vi.fn());
  });

  it('authorizes then binds the exact execution to the live SSM session', async () => {
    const fetchMock = vi.mocked(fetch);
    fetchMock
      .mockResolvedValueOnce(new Response(JSON.stringify({ authorization: { executionId } }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        receipt: {
          executionId,
          evidenceId,
          executionReceiptId: receiptId,
          sessionId,
          provenance: 'browser-observed',
          surface: 'academy',
        },
      }), { status: 200 }));

    const result = await prepareTerminalExecution({
      labInstanceId: labId,
      surface: 'academy',
      command: 'docker ps',
      sessionId,
    });

    expect(result).toMatchObject({ executionId, evidenceId, executionReceiptId: receiptId, sessionId, surface: 'academy' });
    expect(fetchMock).toHaveBeenNthCalledWith(1, `/api/labs/instances/${labId}/ai/terminal`, expect.objectContaining({
      body: JSON.stringify({ action: 'authorize', surface: 'academy', command: 'docker ps', approved: true }),
    }));
    expect(fetchMock).toHaveBeenNthCalledWith(2, `/api/labs/instances/${labId}/ai/terminal`, expect.objectContaining({
      body: JSON.stringify({ action: 'begin', surface: 'academy', executionId, command: 'docker ps', sessionId }),
    }));
  });

  it('records browser output only with the exact receipt and session binding', async () => {
    const fetchMock = vi.mocked(fetch);
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({
      execution: {
        command: 'uname -a',
        stdout: 'Linux',
        stderr: '',
        exitCode: 0,
        risk: 'read-only',
        executionId,
        evidenceId,
        provenance: 'browser-observed',
        executionReceiptId: receiptId,
        terminalSessionId: sessionId,
        surface: 'ai-practitioner',
      },
    }), { status: 200 }));

    const result = await persistTerminalExecution({
      labInstanceId: labId,
      receipt: {
        executionId,
        evidenceId,
        executionReceiptId: receiptId,
        sessionId,
        provenance: 'browser-observed',
        surface: 'ai-practitioner',
      },
      command: 'uname -a',
      stdout: 'Linux',
      stderr: '',
      exitCode: 0,
    });

    expect(result.evidenceId).toBe(evidenceId);
    expect(fetchMock).toHaveBeenCalledWith(`/api/labs/instances/${labId}/ai/terminal`, expect.objectContaining({
      body: JSON.stringify({
        action: 'record',
        surface: 'ai-practitioner',
        executionId,
        executionReceiptId: receiptId,
        sessionId,
        command: 'uname -a',
        stdout: 'Linux',
        stderr: '',
        exitCode: 0,
      }),
    }));
  });
});
