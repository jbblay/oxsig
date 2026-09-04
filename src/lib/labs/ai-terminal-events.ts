export const AI_TERMINAL_QUERY_EVENT = 'oxsig:ai-terminal-query';
export const AI_TERMINAL_STATE_EVENT = 'oxsig:ai-terminal-state';
export const AI_TERMINAL_RUN_EVENT = 'oxsig:ai-terminal-run';
export const AI_TERMINAL_RESULT_EVENT = 'oxsig:ai-terminal-result';

export type AiTerminalState = {
  labInstanceId: string;
  connected: boolean;
};

export type AiTerminalRunRequest = {
  requestId: string;
  labInstanceId: string;
  command: string;
};

export type AiTerminalRunResult = {
  requestId: string;
  labInstanceId: string;
  command: string;
  stdout: string;
  stderr: string;
  exitCode: number;
  error?: string;
};
