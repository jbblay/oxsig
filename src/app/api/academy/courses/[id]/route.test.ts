import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';

const mocks = vi.hoisted(() => ({
  requireAuth: vi.fn(),
  validateCsrfToken: vi.fn(),
  checkRateLimit: vi.fn(),
  getOwnedAcademyCourse: vi.fn(),
  activateAcademyCourse: vi.fn(),
  archiveAcademyCourse: vi.fn(),
  deleteAcademyCourse: vi.fn(),
}));

vi.mock('@/lib/auth/middleware', () => ({ requireAuth: mocks.requireAuth }));
vi.mock('@/lib/security/csrf', () => ({ validateCsrfToken: mocks.validateCsrfToken }));
vi.mock('@/lib/security/rate-limit', () => ({ checkRateLimit: mocks.checkRateLimit }));
vi.mock('@/lib/academy/course-lifecycle', () => ({
  getOwnedAcademyCourse: mocks.getOwnedAcademyCourse,
  activateAcademyCourse: mocks.activateAcademyCourse,
  archiveAcademyCourse: mocks.archiveAcademyCourse,
  deleteAcademyCourse: mocks.deleteAcademyCourse,
}));

import { DELETE, GET, PATCH } from './route';

const user = { id: 'user-1', role: 'user' as const };
const courseId = '11111111-1111-4111-8111-111111111111';
const course = {
  courseId,
  course: { title: 'Course' },
  courseStatus: 'archived',
};

function request(method: 'GET' | 'PATCH' | 'DELETE', body?: unknown, id = courseId) {
  return {
    request: new NextRequest(`http://localhost/api/academy/courses/${id}`, {
      method,
      headers: body ? { 'Content-Type': 'application/json' } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    }),
    context: { params: Promise.resolve({ id }) },
  };
}

describe('/api/academy/courses/[id]', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireAuth.mockImplementation(async (
      req: NextRequest,
      handler: (req: NextRequest, user: typeof user) => Promise<NextResponse>
    ) => handler(req, user));
    mocks.validateCsrfToken.mockResolvedValue(true);
    mocks.checkRateLimit.mockResolvedValue(null);
    mocks.getOwnedAcademyCourse.mockResolvedValue(course);
    mocks.activateAcademyCourse.mockResolvedValue(true);
    mocks.archiveAcademyCourse.mockResolvedValue(true);
    mocks.deleteAcademyCourse.mockResolvedValue(true);
  });

  it('reads only through the authenticated owner scope', async () => {
    const input = request('GET');
    const response = await GET(input.request, input.context);
    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(mocks.getOwnedAcademyCourse).toHaveBeenCalledWith(user.id, courseId);
  });

  it('rejects invalid course ids before persistence', async () => {
    const input = request('GET', undefined, 'not-a-uuid');
    const response = await GET(input.request, input.context);
    expect(response.status).toBe(400);
    expect(mocks.getOwnedAcademyCourse).not.toHaveBeenCalled();
  });

  it('requires CSRF for lifecycle changes', async () => {
    mocks.validateCsrfToken.mockResolvedValue(false);
    const input = request('PATCH', { action: 'activate' });
    const response = await PATCH(input.request, input.context);
    expect(response.status).toBe(403);
    expect(mocks.activateAcademyCourse).not.toHaveBeenCalled();
  });

  it('activates an owned archived course', async () => {
    const input = request('PATCH', { action: 'activate' });
    const response = await PATCH(input.request, input.context);
    expect(response.status).toBe(200);
    expect(mocks.activateAcademyCourse).toHaveBeenCalledWith(user.id, courseId);
    expect(mocks.archiveAcademyCourse).not.toHaveBeenCalled();
  });

  it('archives an owned course', async () => {
    const input = request('PATCH', { action: 'archive' });
    const response = await PATCH(input.request, input.context);
    expect(response.status).toBe(200);
    expect(mocks.archiveAcademyCourse).toHaveBeenCalledWith(user.id, courseId);
  });

  it('permanently deletes an owned course', async () => {
    const input = request('DELETE');
    const response = await DELETE(input.request, input.context);
    expect(response.status).toBe(200);
    expect(mocks.deleteAcademyCourse).toHaveBeenCalledWith(user.id, courseId);
    expect(await response.json()).toEqual({ deleted: true });
  });

  it('does not reveal a course outside the owner scope', async () => {
    mocks.deleteAcademyCourse.mockResolvedValue(false);
    const input = request('DELETE');
    const response = await DELETE(input.request, input.context);
    expect(response.status).toBe(404);
  });
});
