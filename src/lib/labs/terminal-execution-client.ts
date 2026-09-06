import { getCsrfToken } from '@/lib/security/csrf-client';
import type { AiTerminalSurface } from './ai-terminal-events';

async function apiError(response: Response, fallback: string) {
  const body = await response.json().catch(() => ({}));
  return body?.error || fallback;
}

export type PreparedTerminalExecution = {
  executionId: string;
  evidenceId: string;
  executionReceiptId: string;
  sessionId: string;
  expiresAt?: string;
  provenance: 'browser-observed';
  surface: AiTerminalSurface;
};

export type PersistedTerminalExecution = {
  command: string;
  stdout: string;
  stderr: string;
  exitCode: number;
  risk: 'read-only' | 'changes-system';
  executionId: string;
  evidenceId: string;
  provenance: 'browser-observed';
  executionReceiptId: string;
  terminalSessionId: string;
  surface: AiTerminalSurface;
};

export async function prepareTerminalExecution(input: {
  labInstanceId: string;
  surface: AiTerminalSurface;
  command: string;
  sessionId: string;
}): Promise<PreparedTerminalExecution> {
  const token = await getCsrfToken();
  const authorizationResponse = await fetch(`/api/labs/instances/${input.labInstanceId}/ai/terminal`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-csrf-token': token },
    body: JSON.stringify({
      action: 'authorize',
      surface: input.surface,
      command: input.command,
      approved: true,
    }),
  });
  if (!authorizationResponse.ok) {
    throw new Error(await apiError(authorizationResponse, 'The terminal command was not authorized'));
  }
  const authorizationBody = await authorizationResponse.json() as {
    authorization?: { executionId?: string };
  };
  const executionId = authorizationBody.authorization?.executionId;
  if (!executionId) throw new Error('Oxsig did not return an execution authorization identifier.');

  const beginToken = await getCsrfToken();
  const beginResponse = await fetch(`/api/labs/instances/${input.labInstanceId}/ai/terminal`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-csrf-token': beginToken },
    body: JSON.stringify({
      action: 'begin',
      surface: input.surface,
      executionId,
      command: input.command,
      sessionId: input.sessionId,
    }),
  });
  if (!beginResponse.ok) {
    throw new Error(await apiError(beginResponse, 'Oxsig could not bind the command to this live terminal session'));
  }
  const beginBody = await beginResponse.json() as { receipt?: PreparedTerminalExecution };
  const receipt = beginBody.receipt;
  if (!receipt?.executionId || !receipt.evidenceId || !receipt.executionReceiptId || !receipt.sessionId) {
    throw new Error('Oxsig did not return a complete one-time terminal execution receipt.');
  }
  return receipt;
}

export async function persistTerminalExecution(input: {
  labInstanceId: string;
  receipt: PreparedTerminalExecution;
  command: string;
  stdout: string;
  stderr: string;
  exitCode: number;
}): Promise<PersistedTerminalExecution> {
  const token = await getCsrfToken();
  const response = await fetch(`/api/labs/instances/${input.labInstanceId}/ai/terminal`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-csrf-token': token },
    body: JSON.stringify({
      action: 'record',
      surface: input.receipt.surface,
      executionId: input.receipt.executionId,
      executionReceiptId: input.receipt.executionReceiptId,
      sessionId: input.receipt.sessionId,
      command: input.command,
      stdout: input.stdout,
      stderr: input.stderr,
      exitCode: input.exitCode,
    }),
  });
  if (!response.ok) {
    throw new Error(await apiError(response, 'The visible terminal ran the command, but Oxsig could not persist its bound evidence'));
  }
  const body = await response.json() as { execution?: PersistedTerminalExecution };
  if (!body.execution?.evidenceId || !body.execution.executionId || !body.execution.executionReceiptId || !body.execution.terminalSessionId) {
    throw new Error('Oxsig returned an incomplete persisted terminal evidence record.');
  }
  return body.execution;
}
