import { describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

import { academyRequestSchema } from './server';

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

  it('rejects unbounded or malformed Academy requests', () => {
    expect(academyRequestSchema.safeParse({ action: 'generate', prompt: 'x' }).success).toBe(false);
    expect(academyRequestSchema.safeParse({ action: 'ask', question: '', courseTitle: 'Docker', lessonTitle: 'One', lessonContext: '' }).success).toBe(false);
  });
});
