import 'server-only';

import { z } from 'zod';
import { PROGRAM_PROCESS_CAPABILITIES } from '@/lib/learning/program-process-path';

export type ProgramProcessAssessmentEvaluation = {
  score: number;
  status: 'developing' | 'demonstrated';
  feedback: string;
  evidenceConnection: string;
  misconceptions: string[];
  nextStep: string | null;
};

const evaluationSchema = z.object({
  score: z.number().int().min(0).max(100),
  status: z.enum(['developing', 'demonstrated']),
  feedback: z.string().min(1).max(2200),
  evidenceConnection: z.string().min(1).max(1400),
  misconceptions: z.array(z.string().min(1).max(500)).max(6),
  nextStep: z.string().max(700).nullable(),
}).strict();

const JSON_SCHEMA: Record<string, unknown> = {
  type: 'object',
  properties: {
    score: { type: 'integer', minimum: 0, maximum: 100 },
    status: { type: 'string', enum: ['developing', 'demonstrated'] },
    feedback: { type: 'string' },
    evidenceConnection: { type: 'string' },
    misconceptions: { type: 'array', items: { type: 'string' } },
    nextStep: { type: ['string', 'null'] },
  },
  required: ['score', 'status', 'feedback', 'evidenceConnection', 'misconceptions', 'nextStep'],
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

export async function evaluateProgramProcessAssessment(args: {
  capabilityId: string;
  explanation: string;
  practice: {
    command: string;
    stdout: string;
    stderr: string;
    exitCode: number;
    evaluation: Record<string, unknown>;
  };
}): Promise<ProgramProcessAssessmentEvaluation> {
  const capability = PROGRAM_PROCESS_CAPABILITIES.find((item) => item.id === args.capabilityId);
  if (!capability) throw new Error('Unknown program-to-process capability');

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error('AI Academy is not configured. Set OPENAI_API_KEY on the Oxsig server.');

  const instructions = `You are evaluating an experienced learner who chose “Prove what I know” instead of taking the normal lesson.

This is a capability assessment, not a writing-quality test. The learner already completed the real practical checkpoint, and you must judge the explanation against that exact persisted evidence and the curated capability outcome.

Require real conceptual understanding. A learner should explain the mechanism, connect it to the observed evidence, and avoid important misconceptions. Do not reward vague vocabulary, memorized definitions, or merely restating terminal output. Do not invent evidence. A score of 85 or higher may be marked demonstrated. Anything below 85 is developing and must not bypass the normal learning path.`;

  const input = `CAPABILITY\n${capability.title}\n\nREQUIRED OUTCOME\n${capability.outcome}\n\nEVIDENCE REQUIREMENT\n${capability.evidence}\n\nREAL PRACTICAL COMMAND\n${args.practice.command}\n\nREAL EXIT CODE\n${args.practice.exitCode}\n\nREAL STDOUT\n${args.practice.stdout || '(empty)'}\n\nREAL STDERR\n${args.practice.stderr || '(empty)'}\n\nPRIOR PRACTICE EVALUATION\n${JSON.stringify(args.practice.evaluation)}\n\nLEARNER EXPLANATION\n${args.explanation}`;

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
          name: 'oxsig_program_process_assessment',
          strict: true,
          schema: JSON_SCHEMA,
        },
      },
    }),
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(String(payload?.error?.message || `AI provider request failed (${response.status})`).slice(0, 500));
  }

  const text = responseText(payload);
  if (!text) throw new Error('AI provider returned no usable capability assessment');
  const parsed = evaluationSchema.safeParse(JSON.parse(text));
  if (!parsed.success) throw new Error('AI generated an invalid capability assessment');

  return {
    ...parsed.data,
    status: parsed.data.score >= 85 ? 'demonstrated' : 'developing',
  };
}
