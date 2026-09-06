import { describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

import { academyRequestSchema, evaluateAcademyReflection } from './server';

describe('AI Academy request contract', () => {
  it('accepts a course generation request', () => {
    expect(academyRequestSchema.safeParse({
      action: 'generate',
      prompt: 'Teach me Docker basics',
    }).success).toBe(true);
  });

  it('accepts an in-lesson learner question with grounded context', () => {
    expect(academyRequestSchema.safeParse({
      action: 'ask',
      question: 'Why do containers share the host kernel?',
      courseTitle: 'Docker Basics',
      lessonTitle: 'Containers and images',
      lessonContext: 'A container is an isolated process environment built from an image.',
    }).success).toBe(true);
  });

  it('accepts real terminal evidence for a practice evaluation', () => {
    expect(academyRequestSchema.safeParse({
      action: 'evaluate',
      courseTitle: 'Docker Basics',
      lessonTitle: 'Inspect Docker',
      instruction: 'Confirm Docker is available in the lab.',
      command: 'docker --version',
      expected: 'A Docker version string is printed.',
      stdout: 'Docker version 27.1.1, build 6312585',
      stderr: '',
      exitCode: 0,
    }).success).toBe(true);
  });

  it('rejects unbounded or malformed Academy requests', () => {
    expect(academyRequestSchema.safeParse({ action: 'generate', prompt: 'x' }).success).toBe(false);
    expect(academyRequestSchema.safeParse({ action: 'ask', question: '', courseTitle: 'Docker', lessonTitle: 'One', lessonContext: '' }).success).toBe(false);
    expect(academyRequestSchema.safeParse({
      action: 'evaluate',
      courseTitle: 'Docker',
      lessonTitle: 'One',
      instruction: '',
      command: 'docker --version',
      expected: 'version',
      stdout: '',
      stderr: '',
      exitCode: 0,
    }).success).toBe(false);
  });

  it('derives reflection status from the numeric understanding score', async () => {
    vi.stubEnv('OPENAI_API_KEY', 'test-key');
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({
      output_text: JSON.stringify({
        score: 69,
        status: 'demonstrated',
        predictionComparison: 'The prediction was partly correct.',
        explanationFeedback: 'The mechanism needs one more connection.',
        evidenceConnection: 'The learner cited the real output.',
        nextStep: 'Explain why the reported field matters.',
      }),
    }), { status: 200, headers: { 'content-type': 'application/json' } })));

    const evaluation = await evaluateAcademyReflection({
      courseTitle: 'Linux Basics',
      lessonTitle: 'Inspect the kernel',
      instruction: 'Inspect kernel information.',
      expected: 'Kernel details.',
      prediction: 'I expect kernel information.',
      explanation: 'The command showed the kernel release and architecture.',
      command: 'uname -a',
      stdout: 'Linux lab 6.8.0 x86_64',
      stderr: '',
      exitCode: 0,
      practiceEvaluation: { status: 'passed' },
    });

    expect(evaluation.score).toBe(69);
    expect(evaluation.status).toBe('developing');
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });
});
