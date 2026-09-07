import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
const mocks = vi.hoisted(() => ({ query: vi.fn() }));
vi.mock('server-only', () => ({}));
vi.mock('@/lib/auth/middleware', () => ({
  requireAuth: (request: unknown, handler: Function) => handler(request, { id: 'owner' }),
}));
vi.mock('@/lib/security/csrf', () => ({ validateCsrfToken: async () => true }));
vi.mock('@/lib/security/rate-limit', () => ({ checkRateLimit: async () => null }));
vi.mock('@/lib/db/pool', () => ({ getPool: () => ({ query: mocks.query }) }));
import { POST } from './route';
import { PATCH } from './[id]/route';

beforeEach(() => vi.clearAllMocks());

function request(method: string) {
  return new NextRequest('http://localhost/api/vault', {
    method, headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ kind: 'concept', title: 'Example', metadata: { nested: [{ ['bad\u0000key']: 1 }] } }),
  });
}

describe('Vault rejects invalid JSON keys before persistence', () => {
  it('returns 400 for create with an actionable metadata error', async () => {
    const response = await POST(request('POST'));
    expect(response.status).toBe(400);
    expect((await response.json()).details.fieldErrors.metadata)
      .toContain('JSON object keys must not contain NUL characters.');
    expect(mocks.query).not.toHaveBeenCalled();
  });

  it('returns 400 for update before accessing the database', async () => {
    const response = await PATCH(request('PATCH'), { params: Promise.resolve({ id: 'item' }) });
    expect(response.status).toBe(400);
    expect((await response.json()).details.fieldErrors.metadata)
      .toContain('JSON object keys must not contain NUL characters.');
    expect(mocks.query).not.toHaveBeenCalled();
  });
});
