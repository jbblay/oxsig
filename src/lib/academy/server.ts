import 'server-only';

import { z } from 'zod';
import type {
  AcademyCourse,
  AcademyPracticeEvaluation,
  AcademyQuestionAnswer,
  AcademyReflectionEvaluation,
} from './types';

export const academyRequestSchema = z.discriminatedUnion('action', [
  z.object({
    action: z.literal('generate'),
    prompt: z.string().trim().min(3).max(800),
  }).strict(),
  z.object({
    action: z.literal('ask'),
    question: z.string().trim().min(1).max(2000),
    courseTitle: z.string().trim().min(1).max(200),
    lessonTitle: z.string().trim().min(1).max(200),
    lessonContext: z.string().max(8000),
  }).strict(),
  z.object({
    action: z.literal('evaluate'),
    courseTitle: z.string().trim().min(1).max(200),
    lessonTitle: z.string().trim().min(1).max(200),
    instruction: z.string().trim().min(1).max(1200),
    command: z.string().trim().min(1).max(1000),
    expected: z.string().trim().min(1).max(1200),
    stdout: z.string().max(25000).default(''),
    stderr: z.string().max(25000).default(''),
    exitCode: z.number().int().min(-1).max(255),
  }).strict(),
]);

const courseSchema = z.object({
  title: z.string().min(1).max(160),
  topic: z.string().min(1).max(160),
  level: z.enum(['beginner', 'intermediate', 'advanced']),
  overview: z.string().min(1).max(1800),
  estimatedMinutes: z.number().int().min(10).max(720),
  objectives: z.array(z.string().min(1).max(240)).min(2).max(8),
  prerequisites: z.array(z.string().min(1).max(240)).max(8),
  lessons: z.array(z.object({
    id: z.string().regex(/^lesson-[1-9][0-9]*$/),
    title: z.string().min(1).max(160),
    summary: z.string().min(1).max(500),
    explanation: z.string().min(1).max(5000),
    keyPoints: z.array(z.string().min(1).max(300)).min(2).max(7),
    visual: z.object({
      title: z.string().min(1).max(160),
      nodes: z.array(z.string().min(1).max(120)).min(2).max(7),
    }).strict(),
    practice: z.object({
      title: z.string().min(1).max(160),
      instruction: z.string().min(1).max(800),
      command: z.string().min(1).max(1000),
      expected: z.string().min(1).max(700),
      labRequired: z.boolean(),
    }).strict().nullable(),
    checkpoint: z.string().min(1).max(500),
  }).strict()).min(3).max(8),
}).strict();

const answerSchema = z.object({
  answer: z.string().min(1).max(3000),
  suggestedAction: z.string().max(500).nullable(),
}).strict();

const evaluationSchema = z.object({
  status: z.enum(['passed', 'needs-attention']),
  summary: z.string().min(1).max(700),
  feedback: z.string().min(1).max(2200),
  nextStep: z.string().max(700).nullable(),
}).strict();

const reflectionEvaluationSchema = z.object({
  score: z.number().int().min(0).max(100),
  status: z.enum(['developing', 'demonstrated']),
  predictionComparison: z.string().min(1).max(1000),
  explanationFeedback: z.string().min(1).max(2200),
  evidenceConnection: z.string().min(1).max(1200),
  nextStep: z.string().max(700).nullable(),
}).strict();

export function academyModel() {
  return process.env.OXSIG_AI_MODEL?.trim() || 'gpt-5.4-mini';
}

function responseText(payload: any) {
  if (typeof payload?.output_text === 'string' && payload.output_text.trim()) return payload.output_text.trim();
  const parts: string[] = [];
  for (const item of payload?.output || []) {
    for (const content of item?.content || []) {
      if (typeof content?.text === 'string') parts.push(content.text);
    }
  }
  return parts.join('\n').trim();
}

async function callStructured<T>(args: {
  name: string;
  instructions: string;
  input: string;
  schema: Record<string, unknown>;
  maxOutputTokens?: number;
}): Promise<T> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error('AI Academy is not configured. Set OPENAI_API_KEY on the Oxsig server.');

  const response = await fetch('https://api.openai.com/v1/responses', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: academyModel(),
      store: false,
      instructions: args.instructions,
      input: args.input,
      max_output_tokens: args.maxOutputTokens ?? 6000,
      text: {
        format: {
          type: 'json_schema',
          name: args.name,
          strict: true,
          schema: args.schema,
        },
      },
    }),
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(String(payload?.error?.message || `AI provider request failed (${response.status})`).slice(0, 500));
  }

  const text = responseText(payload);
  if (!text) throw new Error('AI provider returned no usable Academy content');
  return JSON.parse(text) as T;
}

const COURSE_JSON_SCHEMA: Record<string, unknown> = {
  type: 'object',
  properties: {
    title: { type: 'string' },
    topic: { type: 'string' },
    level: { type: 'string', enum: ['beginner', 'intermediate', 'advanced'] },
    overview: { type: 'string' },
    estimatedMinutes: { type: 'integer' },
    objectives: { type: 'array', items: { type: 'string' } },
    prerequisites: { type: 'array', items: { type: 'string' } },
    lessons: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          title: { type: 'string' },
          summary: { type: 'string' },
          explanation: { type: 'string' },
          keyPoints: { type: 'array', items: { type: 'string' } },
          visual: {
            type: 'object',
            properties: {
              title: { type: 'string' },
              nodes: { type: 'array', items: { type: 'string' } },
            },
            required: ['title', 'nodes'],
            additionalProperties: false,
          },
          practice: {
            type: ['object', 'null'],
            properties: {
              title: { type: 'string' },
              instruction: { type: 'string' },
              command: { type: 'string' },
              expected: { type: 'string' },
              labRequired: { type: 'boolean' },
            },
            required: ['title', 'instruction', 'command', 'expected', 'labRequired'],
            additionalProperties: false,
          },
          checkpoint: { type: 'string' },
        },
        required: ['id', 'title', 'summary', 'explanation', 'keyPoints', 'visual', 'practice', 'checkpoint'],
        additionalProperties: false,
      },
    },
  },
  required: ['title', 'topic', 'level', 'overview', 'estimatedMinutes', 'objectives', 'prerequisites', 'lessons'],
  additionalProperties: false,
};

const ANSWER_JSON_SCHEMA: Record<string, unknown> = {
  type: 'object',
  properties: {
    answer: { type: 'string' },
    suggestedAction: { type: ['string', 'null'] },
  },
  required: ['answer', 'suggestedAction'],
  additionalProperties: false,
};

const EVALUATION_JSON_SCHEMA: Record<string, unknown> = {
  type: 'object',
  properties: {
    status: { type: 'string', enum: ['passed', 'needs-attention'] },
    summary: { type: 'string' },
    feedback: { type: 'string' },
    nextStep: { type: ['string', 'null'] },
  },
  required: ['status', 'summary', 'feedback', 'nextStep'],
  additionalProperties: false,
};

const REFLECTION_EVALUATION_JSON_SCHEMA: Record<string, unknown> = {
  type: 'object',
  properties: {
    score: { type: 'integer', minimum: 0, maximum: 100 },
    status: { type: 'string', enum: ['developing', 'demonstrated'] },
    predictionComparison: { type: 'string' },
    explanationFeedback: { type: 'string' },
    evidenceConnection: { type: 'string' },
    nextStep: { type: ['string', 'null'] },
  },
  required: ['score', 'status', 'predictionComparison', 'explanationFeedback', 'evidenceConnection', 'nextStep'],
  additionalProperties: false,
};

export async function generateAcademyCourse(prompt: string): Promise<AcademyCourse> {
  const instructions = `You are Oxsig Academy's curriculum generator. Turn the learner request into a compact, practical technical course.

Oxsig owns the course structure. You must return 3 to 6 ordered lessons and use lesson ids lesson-1, lesson-2, and so on. Teach progressively: mental model first, then practical use, then verification/troubleshooting where appropriate.

Every lesson must include:
- a concise summary;
- a useful explanation written for focused learning rather than a long textbook chapter;
- 2 to 6 key points;
- a simple visual model expressed as 2 to 6 short ordered nodes. The UI will render these as a diagram, so each node must be a compact concept, component, or flow step;
- a checkpoint question or challenge.

Practice rules:
- Add practice only where hands-on work genuinely improves learning.
- Practice commands must be safe, single-shell commands suitable for an authorized learner-owned Linux lab.
- Prefer inspection, creation of disposable examples, and normal development operations.
- Never include destructive disk/boot operations, credential theft, malware, persistence, denial-of-service, remote shells, or commands targeting public/external systems.
- A course may contain conceptual lessons without practice.
- Practice does not execute automatically. The learner will explicitly choose when to open or use the Cyber Lab.

Estimate a realistic total learning time. Infer the learner level from the request; use beginner when unclear. Keep the course coherent enough that progress can later be measured lesson by lesson.`;

  const raw = await callStructured<AcademyCourse>({
    name: 'oxsig_academy_course',
    instructions,
    input: `LEARNER REQUEST\n${prompt}`,
    schema: COURSE_JSON_SCHEMA,
    maxOutputTokens: 7000,
  });

  const parsed = courseSchema.safeParse(raw);
  if (!parsed.success) throw new Error('AI generated a course that did not match the Oxsig Academy learning contract');
  return parsed.data;
}

export async function answerAcademyQuestion(args: {
  question: string;
  courseTitle: string;
  lessonTitle: string;
  lessonContext: string;
}): Promise<AcademyQuestionAnswer> {
  const instructions = `You are the Oxsig Academy instructor answering a learner inside one generated lesson. Stay grounded in the supplied course and lesson context. Answer the exact question directly, then connect it back to the current lesson. If a practical action would help, suggest one next action in plain language, but do not claim to have executed anything and do not silently issue lab commands. Keep security examples inside authorized learner-owned labs.`;

  const raw = await callStructured<AcademyQuestionAnswer>({
    name: 'oxsig_academy_answer',
    instructions,
    input: `COURSE: ${args.courseTitle}\nLESSON: ${args.lessonTitle}\n\nLESSON CONTEXT\n${args.lessonContext}\n\nLEARNER QUESTION\n${args.question}`,
    schema: ANSWER_JSON_SCHEMA,
    maxOutputTokens: 1800,
  });

  const parsed = answerSchema.safeParse(raw);
  if (!parsed.success) throw new Error('AI generated an invalid Academy answer');
  return parsed.data;
}

export async function evaluateAcademyPractice(args: {
  courseTitle: string;
  lessonTitle: string;
  instruction: string;
  command: string;
  expected: string;
  stdout: string;
  stderr: string;
  exitCode: number;
}): Promise<AcademyPracticeEvaluation> {
  const instructions = `You are the Oxsig Academy instructor evaluating a real command that a learner explicitly approved and ran in their authorized Oxsig Cyber Lab terminal.

Judge only from the supplied command, exit code, stdout, stderr, lesson instruction, and expected result. Never invent output or claim evidence that is absent. Mark status passed only when the evidence reasonably demonstrates the lesson objective or expected behavior. A zero exit code alone is not always enough if the expected evidence is missing. If the result needs attention, explain the likely reason in learner-friendly language and give one safe next step. Keep the response concise and focused on teaching from the real terminal evidence.`;

  const raw = await callStructured<AcademyPracticeEvaluation>({
    name: 'oxsig_academy_practice_evaluation',
    instructions,
    input: `COURSE: ${args.courseTitle}\nLESSON: ${args.lessonTitle}\n\nPRACTICE INSTRUCTION\n${args.instruction}\n\nAPPROVED COMMAND\n${args.command}\n\nEXPECTED RESULT\n${args.expected}\n\nREAL EXIT CODE\n${args.exitCode}\n\nREAL STDOUT\n${args.stdout || '(empty)'}\n\nREAL STDERR\n${args.stderr || '(empty)'}`,
    schema: EVALUATION_JSON_SCHEMA,
    maxOutputTokens: 1800,
  });

  const parsed = evaluationSchema.safeParse(raw);
  if (!parsed.success) throw new Error('AI generated an invalid Academy practice evaluation');
  return parsed.data;
}

export async function evaluateAcademyReflection(args: {
  courseTitle: string;
  lessonTitle: string;
  instruction: string;
  expected: string;
  prediction: string;
  explanation: string;
  command: string;
  stdout: string;
  stderr: string;
  exitCode: number;
  practiceEvaluation: Record<string, unknown>;
}): Promise<AcademyReflectionEvaluation> {
  const instructions = `You are the Oxsig Academy instructor assessing whether a learner understands a practical result they actually observed.

The learner made a prediction before execution and then wrote an explanation after Oxsig captured and evaluated the exact terminal evidence. Assess conceptual understanding, not writing polish. Ground every judgment in the supplied prediction, command, real stdout/stderr/exit code, and the prior Academy practice evaluation. Do not invent evidence. Reward a learner who correctly explains cause, mechanism, and what the evidence means, even if their prediction was initially wrong and they corrected their model afterward. Do not reward merely repeating output without explaining it.

Score from 0 to 100. Scores 70 or above represent demonstrated understanding for this checkpoint; lower scores are developing. Explain how the prediction compared with reality, what the explanation got right or missed, how it connects to the evidence, and one next step when useful.`;

  const raw = await callStructured<AcademyReflectionEvaluation>({
    name: 'oxsig_academy_learning_reflection',
    instructions,
    input: `COURSE: ${args.courseTitle}\nLESSON: ${args.lessonTitle}\n\nPRACTICE INSTRUCTION\n${args.instruction}\n\nEXPECTED RESULT\n${args.expected}\n\nLEARNER PREDICTION CAPTURED BEFORE EXECUTION\n${args.prediction}\n\nEXACT COMMAND\n${args.command}\n\nREAL EXIT CODE\n${args.exitCode}\n\nREAL STDOUT\n${args.stdout || '(empty)'}\n\nREAL STDERR\n${args.stderr || '(empty)'}\n\nACADEMY PRACTICE EVALUATION\n${JSON.stringify(args.practiceEvaluation)}\n\nLEARNER EXPLANATION AFTER OBSERVING EVIDENCE\n${args.explanation}`,
    schema: REFLECTION_EVALUATION_JSON_SCHEMA,
    maxOutputTokens: 1800,
  });

  const parsed = reflectionEvaluationSchema.safeParse(raw);
  if (!parsed.success) throw new Error('AI generated an invalid Academy learner-reflection evaluation');
  return {
    ...parsed.data,
    status: parsed.data.score >= 70 ? 'demonstrated' : 'developing',
  };
}