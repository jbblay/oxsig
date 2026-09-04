export type AiPractitionerRisk = 'read-only' | 'changes-system';

export type AiPractitionerPlan = {
  title: string;
  explanation: string;
  objective: string;
  command: string | null;
  expected: string;
  risk: AiPractitionerRisk;
  approvalReason: string;
  nextConcept: string;
};

export type AiPractitionerAnalysis = {
  summary: string;
  observations: string[];
  interpretation: string;
  nextStep: string;
  vaultNote: string;
};

export type AiPractitionerExecution = {
  command: string;
  stdout: string;
  stderr: string;
  exitCode: number;
  risk: AiPractitionerRisk;
};

export type AiPractitionerHistoryItem = {
  role: 'user' | 'assistant';
  content: string;
};
