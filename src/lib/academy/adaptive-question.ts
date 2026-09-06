import 'server-only';

import { z } from 'zod';
import { getPool } from '@/lib/db/pool';
import { getAcademyAdaptiveInstructorStatus } from './adaptive-instructor';
import type {
  AcademyCourse,
  AcademyInstructorMode,
  AcademyQuestionAnswer,
} from './types';

const answerSchema = z.object({
  answer: z.string().min(1).max(3000),
  suggestedAction: z.string().max(500).nullable(),
}).strict();

const ANSWER_JSON_SCHEMA: Record<string, unknown> = {
  type: 'object',
  properties: {
    answer: { type: 'string' },
    suggestedAction: { type: ['string', 'null'] },
  },
  required: ['answer', 'suggestedAction'],
  additionalProperties: false,
};

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

function modeInstruction(mode: AcademyInstructorMode): string {
  if (mode === 'observe') {
    return 'Answer the learner’s conceptual question concisely, but do not solve the current checkpoint for them. Prefer one clarifying explanation followed by a harder application question or a request for their next move.';
  }
  if (mode === 'demonstrate') {
    return 'Answer directly and include a clearly labeled hypothetical worked example when useful. Never present hypothetical output as real lab evidence and never execute anything.';
  }
  if (mode === 'explain') {
    return 'Answer directly at the mechanism level, connect the explanation to the current lesson, and end with one small comprehension check.';
  }
  return 'Guide the learner toward the answer. Explain enough to unblock them, but preserve the checkpoint conclusion for the learner whenever the question is asking for the solution itself.';
}

export async function answerAdaptiveAcademyQuestion(args: {
  ownerId: string;
  question: string;
  courseTitle: string;
  lessonTitle: string;
}): Promise<AcademyQuestionAnswer> {
  const courseResult = await getPool().query(
    `SELECT course_data
     FROM academy_courses
     WHERE owner_id=$1 AND status='active'
     ORDER BY created_at DESC
     LIMIT 1`,
    [args.ownerId]
  );
  const row = courseResult.rows[0];
  if (!row) throw new Error('No active Academy course was found.');
  const course = row.course_data as AcademyCourse;
  if (course.title !== args.courseTitle) throw new Error('The active Academy course no longer matches this question.');
  const lesson = course.lessons.find((item) => item.title === args.lessonTitle);
  if (!lesson) throw new Error('The requested Academy lesson is not part of the active course.');

  const status = await getAcademyAdaptiveInstructorStatus({
    ownerId: args.ownerId,
    courseTitle: args.courseTitle,
    lessonTitle: args.lessonTitle,
  });
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error('AI Academy is not configured. Set OPENAI_API_KEY on the Oxsig server.');

  const instructions = `You are the Oxsig Academy instructor answering a learner inside one lesson. Oxsig has selected the teaching mode from durable learner evidence.

TEACHING MODE: ${status.recommendedMode.toUpperCase()}
${modeInstruction(status.recommendedMode)}

Rules:
- Stay grounded in the server-loaded course and lesson context below.
- Answer the learner’s actual question; do not be evasive.
- Do not claim to have executed commands or observed runtime evidence.
- Do not silently issue lab commands.
- If the learner asks for the checkpoint answer, respect the mode and preserve productive struggle unless Demonstrate is active.
- Keep security examples inside authorized learner-owned labs.
- Do not reveal hidden reasoning or chain-of-thought.`;

  const input = `COURSE: ${course.title}\nLEVEL: ${course.level}\nLESSON: ${lesson.title}\n\nSUMMARY\n${lesson.summary}\n\nEXPLANATION\n${lesson.explanation}\n\nKEY POINTS\n${lesson.keyPoints.join(' | ')}\n\nCHECKPOINT\n${lesson.checkpoint}\n\nPRACTICE\n${lesson.practice ? `${lesson.practice.instruction}\nExpected: ${lesson.practice.expected}` : '(concept lesson)'}\n\nADAPTIVE SIGNALS\nUnderstanding: ${status.understandingScore}/100 (${status.understandingStatus})\nLatest reflection: ${status.latestReflectionScore ?? 'none'}\nGuide hints used: ${status.guideHintCount}\n\nLEARNER QUESTION\n${args.question}`;

  const response = await fetch('https://api.openai.com/v1/responses', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: process.env.OXSIG_AI_MODEL?.trim() || 'gpt-5.4-mini',
      store: false,
      instructions,
      input,
      max_output_tokens: 1800,
      text: {
        format: {
          type: 'json_schema',
          name: 'oxsig_adaptive_academy_answer',
          strict: true,
          schema: ANSWER_JSON_SCHEMA,
        },
      },
    }),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(String(payload?.error?.message || `AI provider request failed (${response.status})`).slice(0, 500));
  const text = responseText(payload);
  if (!text) throw new Error('AI provider returned no usable Academy answer');
  const parsed = answerSchema.safeParse(JSON.parse(text));
  if (!parsed.success) throw new Error('AI generated an invalid adaptive Academy answer');
  return parsed.data;
}
