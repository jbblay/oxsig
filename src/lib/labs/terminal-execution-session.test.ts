import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ send: vi.fn() }));

vi.mock('server-only', () => ({}));
vi.mock('@aws-sdk/client-ssm', () => ({
  SSMClient: class SSMClient {
    send(command: unknown) { return mocks.send(command); }
  },
  DescribeSessionsCommand: class DescribeSessionsCommand {
    constructor(readonly input: unknown) {}
  },
}));

import {
  TerminalExecutionSessionError,
  verifyActiveTerminalExecutionSession,
} from './terminal-execution-session';

const instanceId = 'i-0123456789abcdef0';
const sessionId = 'jbblay-session-abc123';

describe('verifyActiveTerminalExecutionSession', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns only an active session targeting the exact lab runtime', async () => {
    mocks.send.mockResolvedValue({
      Sessions: [{
        SessionId: sessionId,
        Target: instanceId,
        Owner: 'learner',
        StartDate: new Date('2026-09-06T04:00:00.000Z'),
      }],
    });

    const result = await verifyActiveTerminalExecutionSession(instanceId, sessionId);

    expect(mocks.send).toHaveBeenCalledTimes(1);
    const command = mocks.send.mock.calls[0][0] as { input: Record<string, unknown> };
    expect(command.input).toMatchObject({
      State: 'Active',
      Filters: [{ key: 'SessionId', value: sessionId }],
      MaxResults: 10,
    });
    expect(result).toMatchObject({
      sessionId,
      target: instanceId,
      owner: 'learner',
      startedAt: '2026-09-06T04:00:00.000Z',
    });
  });

  it('rejects a session that is no longer active', async () => {
    mocks.send.mockResolvedValue({ Sessions: [] });

    await expect(verifyActiveTerminalExecutionSession(instanceId, sessionId)).rejects.toMatchObject({
      code: 'TERMINAL_SESSION_NOT_ACTIVE',
    } satisfies Partial<TerminalExecutionSessionError>);
  });

  it('rejects an active session that targets another runtime', async () => {
    mocks.send.mockResolvedValue({
      Sessions: [{ SessionId: sessionId, Target: 'i-0ffffffffffffffff' }],
    });

    await expect(verifyActiveTerminalExecutionSession(instanceId, sessionId)).rejects.toMatchObject({
      code: 'TERMINAL_SESSION_TARGET_MISMATCH',
    } satisfies Partial<TerminalExecutionSessionError>);
  });
});
