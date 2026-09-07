import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';

const mocks = vi.hoisted(() => ({
  requireAuth: vi.fn(),
  validateCsrfToken: vi.fn(),
  checkRateLimit: vi.fn(),
  generateAcademyCourse: vi.fn(),
  captureProductEvent: vi.fn(),
}));

vi.mock('server-only', () => ({}));
vi.mock('@/lib/auth/middleware', () => ({ requireAuth: mocks.requireAuth }));
vi.mock('@/lib/security/csrf', () => ({ validateCsrfToken: mocks.validateCsrfToken }));
vi.mock('@/lib/security/rate-limit', () => ({ checkRateLimit: mocks.checkRateLimit }));
vi.mock('@/lib/academy/server', () => ({ generateAcademyCourse: mocks.generateAcademyCourse }));
vi.mock('@/lib/analytics/posthog', () => ({ captureProductEvent: mocks.captureProductEvent }));

import { POST } from './route';

const user = { id: 'user-1', clerkUserId: 'clerk-1', role: 'user' as const };
const course = {
  title: 'ELF files',
  topic: 'ELF',
  level: 'intermediate' as const,
  overview: 'Temporary technical exploration.',
  estimatedMinutes: 20,
  objectives: ['Explain ELF structure.'],
  prerequisites: [],
  lessons: [],
};

function request(body: unknown) {
  return new NextRequest('http://localhost/api/academy/explore', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'content-type': 'application/json' },
  });
}

describe('Academy Explore', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireAuth.mockImplementation(async (
      req: NextRequest,
      handler: (req: NextRequest, currentUser: typeof user) => Promise<NextResponse>
    ) => handler(req, user));
    mocks.validateCsrfToken.mockResolvedValue(true);
    mocks.checkRateLimit.mockResolvedValue(null);
    mocks.generateAcademyCourse.mockResolvedValue(course);
    mocks.captureProductEvent.mockResolvedValue(undefined);
  });

  it('returns a temporary exploration without claiming durable capability progress', async () => {
    const response = await POST(request({ prompt: 'What exactly is an ELF file?' }));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(mocks.generateAcademyCourse).toHaveBeenCalledWith('What exactly is an ELF file?');
    expect(body.exploration.course).toEqual(course);
    expect(body.exploration.durable).toBe(false);
    expect(body.exploration.capabilityProgressAffected).toBe(false);
    expect(mocks.captureProductEvent).toHaveBeenCalledWith(expect.objectContaining({
      event: 'academy_topic_explored',
    }));
  });

  it('rejects invalid prompts before generating content', async () => {
    const response = await POST(request({ prompt: 'x' }));

    expect(response.status).toBe(400);
    expect(mocks.generateAcademyCourse).not.toHaveBeenCalled();
  });
});
