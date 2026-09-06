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

export type AcademyPracticeEvaluation = {
  status: 'passed' | 'needs-attention';
  summary: string;
  feedback: string;
  nextStep: string | null;
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
  status: 'predicted' | 'reflected';
  createdAt: string;
  reflectedAt: string | null;
};