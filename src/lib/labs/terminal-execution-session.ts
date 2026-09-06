import 'server-only';

import { DescribeSessionsCommand, SSMClient } from '@aws-sdk/client-ssm';

const REGION = process.env.LAB_AWS_REGION || process.env.AWS_REGION || 'eu-central-1';
const ssm = new SSMClient({ region: REGION });
const INSTANCE_ID = /^i-[0-9a-f]+$/i;
const SESSION_ID = /^[A-Za-z0-9_.:@-]+$/;

export class TerminalExecutionSessionError extends Error {
  constructor(message: string, readonly code: string) {
    super(message);
    this.name = 'TerminalExecutionSessionError';
  }
}

export async function verifyActiveTerminalExecutionSession(instanceId: string, sessionId: string) {
  if (!INSTANCE_ID.test(instanceId)) {
    throw new TerminalExecutionSessionError('The lab runtime identifier is invalid.', 'TERMINAL_RUNTIME_INVALID');
  }
  if (!sessionId || sessionId.length > 128 || !SESSION_ID.test(sessionId)) {
    throw new TerminalExecutionSessionError('The terminal session identifier is invalid.', 'TERMINAL_SESSION_INVALID');
  }

  const described = await ssm.send(new DescribeSessionsCommand({
    State: 'Active',
    Filters: [{ key: 'SessionId', value: sessionId }],
    MaxResults: 10,
  }));
  const session = described.Sessions?.find((item) => item.SessionId === sessionId);
  if (!session) {
    throw new TerminalExecutionSessionError('The terminal session is no longer active.', 'TERMINAL_SESSION_NOT_ACTIVE');
  }
  if (session.Target !== instanceId) {
    throw new TerminalExecutionSessionError('The terminal session does not belong to this lab runtime.', 'TERMINAL_SESSION_TARGET_MISMATCH');
  }

  return {
    sessionId,
    target: instanceId,
    owner: session.Owner || null,
    startedAt: session.StartDate ? session.StartDate.toISOString() : null,
    region: REGION,
  };
}
