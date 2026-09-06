export const AI_TERMINAL_QUERY_EVENT = 'oxsig:ai-terminal-query';
export const AI_TERMINAL_STATE_EVENT = 'oxsig:ai-terminal-state';
export const AI_TERMINAL_RUN_EVENT = 'oxsig:ai-terminal-run';
export const AI_TERMINAL_RESULT_EVENT = 'oxsig:ai-terminal-result';

export type AiTerminalSurface = 'ai-practitioner' | 'academy';

export type AiTerminalState = {
  labInstanceId: string;
  connected: boolean;
  sessionId?: string | null;
};

export type AiTerminalRunRequest = {
  requestId: string;
  labInstanceId: string;
  command: string;
  surface: AiTerminalSurface;
};

export type AiTerminalRunResult = {
  requestId: string;
  labInstanceId: string;
  command: string;
  stdout: string;
  stderr: string;
  exitCode: number;
  executionId?: string;
  evidenceId?: string;
  provenance?: 'browser-observed' | 'server-executed' | 'provider-attested' | 'learner-provided';
  executionReceiptId?: string;
  terminalSessionId?: string;
  surface?: AiTerminalSurface;
  risk?: 'read-only' | 'changes-system';
  error?: string;
};
