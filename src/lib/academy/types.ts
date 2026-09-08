export type AcademyVisual = {
  title: string;
  nodes: string[];
};

export type AcademyPractice = {
  title: string;
  instruction: string;
  command: string;
  expected: string;
  labRequired: boolean;
};

export type AcademyLesson = {
  id: string;
  title: string;
  summary: string;
  explanation: string;
  keyPoints: string[];
  visual: AcademyVisual;
  practice: AcademyPractice | null;
  checkpoint: string;
};

export type AcademyCourse = {
  title: string;
  topic: string;
  level: 'beginner' | 'intermediate' | 'advanced';
  overview: string;
  estimatedMinutes: number;
  objectives: string[];
  prerequisites: string[];
  lessons: AcademyLesson[];
};

export type AcademyQuestionAnswer = {
  answer: string;
  suggestedAction: string | null;
};

export type AcademyPracticeEvidenceBinding = {
  evidenceId: string;
  executionId: string;
  labInstanceId: string;
  provenance: 'browser-observed' | 'server-executed' | 'provider-attested' | 'learner-provided';
  executionReceiptId?: string;
  terminalSessionId?: string;
  risk?: 'read-only' | 'changes-system';
  surface: 'academy';
};

export type AcademyPracticeEvaluation = {
  status: 'passed' | 'needs-attention';
  summary: string;
  feedback: string;
  nextStep: string | null;
  evidenceBinding?: AcademyPracticeEvidenceBinding;
};

export type AcademyReflectionEvaluation = {
  score: number;
  status: 'developing' | 'demonstrated';
  predictionComparison: string;
  explanationFeedback: string;
  evidenceConnection: string;
  nextStep: string | null;
};

export type AcademyUnderstandingSummary = {
  reflectedPractices: number;
  requiredPractices: number;
  averageReflectionScore: number;
  score: number;
  status: 'not_started' | 'developing' | 'demonstrated';
};

export type AcademyLearningReflection = {
  id: string;
  lessonId: string;
  command: string;
  prediction: string;
  evidenceId: string | null;
  explanation: string | null;
  evaluation: AcademyReflectionEvaluation | null;
  explanationScore: number | null;
  status: 'predicted' | 'evaluating' | 'reflected';
  createdAt: string;
  reflectedAt: string | null;
};

export type AcademyInstructorMode = 'explain' | 'guide' | 'demonstrate' | 'observe';

export type AcademyIndependenceSummary = {
  reflectedPractices: number;
  requiredPractices: number;
  instructorInterventions: number;
  score: number;
  status: 'not_started' | 'supported' | 'independent';
};

export type AcademyAdaptiveInstructorStatus = {
  recommendedMode: AcademyInstructorMode;
  reason: string;
  guideHintCount: number;
  nextHintLevel: 1 | 2 | 3;
  understandingScore: number;
  understandingStatus: 'not_started' | 'developing' | 'demonstrated';
  latestReflectionScore: number | null;
  latestPracticeStatus: 'passed' | 'needs-attention' | null;
  independence: AcademyIndependenceSummary;
};

export type AcademyInstructorIntervention = {
  id: string;
  recommendedMode: AcademyInstructorMode;
  requestedMode: AcademyInstructorMode;
  appliedMode: AcademyInstructorMode;
  kind: 'hint' | 'explanation' | 'demonstration' | 'observation';
  hintLevel: 0 | 1 | 2 | 3;
  title: string;
  guidance: string;
  learnerPrompt: string;
  example: string | null;
  independence: AcademyIndependenceSummary;
  createdAt: string;
};