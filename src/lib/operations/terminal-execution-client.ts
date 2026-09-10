import { getCsrfToken } from '@/lib/security/csrf-client';

async function apiError(response: Response, fallback: string) {
  const body = await response.json().catch(() => ({}));
  return body?.error || fallback;
}

export type PreparedOperationTerminalExecution = {
  executionId: string;
  evidenceId: string;
  executionReceiptId: string;
  sessionId: string;
  expiresAt?: string;
  provenance: 'browser-observed';
  surface: 'ai-practitioner';
};

export type PersistedOperationTerminalExecution = {
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
  surface: 'ai-practitioner';
};

function endpoint(runId: string, nodeId: string) {
  return `/api/operations/runs/${encodeURIComponent(runId)}/nodes/${encodeURIComponent(nodeId)}/ai/terminal`;
}

export async function prepareOperationTerminalExecution(input: {
  runId: string;
  nodeId: string;
  command: string;
  sessionId: string;
}): Promise<PreparedOperationTerminalExecution> {
  const token = await getCsrfToken();
  const authorizationResponse = await fetch(endpoint(input.runId, input.nodeId), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-csrf-token': token },
    body: JSON.stringify({ action: 'authorize', surface: 'ai-practitioner', command: input.command, approved: true }),
  });
  if (!authorizationResponse.ok) {
    throw new Error(await apiError(authorizationResponse, 'The Operation terminal command was not authorized'));
  }
  const authorizationBody = await authorizationResponse.json() as { authorization?: { executionId?: string } };
  const executionId = authorizationBody.authorization?.executionId;
  if (!executionId) throw new Error('Oxsig did not return an Operation execution authorization identifier.');

  const beginToken = await getCsrfToken();
  const beginResponse = await fetch(endpoint(input.runId, input.nodeId), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-csrf-token': beginToken },
    body: JSON.stringify({
      action: 'begin',
      surface: 'ai-practitioner',
      executionId,
      command: input.command,
      sessionId: input.sessionId,
    }),
  });
  if (!beginResponse.ok) {
    throw new Error(await apiError(beginResponse, 'Oxsig could not bind the command to this Operation terminal session'));
  }
  const beginBody = await beginResponse.json() as { receipt?: PreparedOperationTerminalExecution };
  const receipt = beginBody.receipt;
  if (!receipt?.executionId || !receipt.evidenceId || !receipt.executionReceiptId || !receipt.sessionId) {
    throw new Error('Oxsig did not return a complete Operation terminal execution receipt.');
  }
  return receipt;
}

export async function persistOperationTerminalExecution(input: {
  runId: string;
  nodeId: string;
  receipt: PreparedOperationTerminalExecution;
  command: string;
  stdout: string;
  stderr: string;
  exitCode: number;
}): Promise<PersistedOperationTerminalExecution> {
  const token = await getCsrfToken();
  const response = await fetch(endpoint(input.runId, input.nodeId), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-csrf-token': token },
    body: JSON.stringify({
      action: 'record',
      surface: 'ai-practitioner',
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
    throw new Error(await apiError(response, 'The visible Operation command ran, but Oxsig could not persist its bound evidence'));
  }
  const body = await response.json() as { execution?: PersistedOperationTerminalExecution };
  if (!body.execution?.evidenceId || !body.execution.executionId || !body.execution.executionReceiptId || !body.execution.terminalSessionId) {
    throw new Error('Oxsig returned an incomplete persisted Operation terminal evidence record.');
  }
  return body.execution;
}
