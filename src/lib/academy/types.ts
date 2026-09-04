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
