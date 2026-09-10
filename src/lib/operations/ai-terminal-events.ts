export const OPERATION_AI_TERMINAL_QUERY_EVENT = 'oxsig:operation-ai-terminal-query';
export const OPERATION_AI_TERMINAL_STATE_EVENT = 'oxsig:operation-ai-terminal-state';
export const OPERATION_AI_TERMINAL_RUN_EVENT = 'oxsig:operation-ai-terminal-run';
export const OPERATION_AI_TERMINAL_RESULT_EVENT = 'oxsig:operation-ai-terminal-result';
export const OPERATION_AI_TARGET_EVENT = 'oxsig:operation-ai-target';
export const OPERATION_AI_TARGET_SELECT_EVENT = 'oxsig:operation-ai-target-select';

export type OperationAiTarget = {
  runId: string;
  nodeId: string;
  nodeKey: string;
  label: string;
  role: 'operator' | 'target' | 'infrastructure';
  osFamily: string;
  privateIp?: string | null;
  status: string;
};

export type OperationAiTerminalState = {
  runId: string;
  nodeId: string;
  connected: boolean;
  sessionId?: string | null;
};

export type OperationAiTerminalRunRequest = {
  requestId: string;
  runId: string;
  nodeId: string;
  command: string;
  surface: 'ai-practitioner';
};

export type OperationAiTerminalRunResult = {
  requestId: string;
  runId: string;
  nodeId: string;
  command: string;
  stdout: string;
  stderr: string;
  exitCode: number;
  executionId?: string;
  evidenceId?: string;
  provenance?: 'browser-observed' | 'server-executed' | 'provider-attested' | 'learner-provided';
  executionReceiptId?: string;
  terminalSessionId?: string;
  surface?: 'ai-practitioner';
  risk?: 'read-only' | 'changes-system';
  error?: string;
};

export type OperationAiTargetSelect = {
  runId: string;
  nodeId: string;
};
