import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const mocks = vi.hoisted(() => ({ send: vi.fn() }));
vi.mock('server-only', () => ({}));
vi.mock('@/lib/auth/middleware', () => ({
  requireAuth: (req: NextRequest, handler: Function) => handler(req, { id: 'owner' }),
}));
vi.mock('@/lib/security/csrf', () => ({ validateCsrfToken: async () => true }));
vi.mock('@/lib/security/rate-limit', () => ({ checkRateLimit: async () => null }));
vi.mock('@/lib/storage/server', async (importOriginal) => ({
  ...await importOriginal<typeof import('@/lib/storage/server')>(),
  getStorageClient: () => ({ send: mocks.send }),
  getStorageBucket: () => 'review-bucket',
}));

import { DELETE } from './route';

function request(keys = ['owner/uploads/one', 'owner/uploads/two']) {
  return new NextRequest('http://localhost/api/storage/delete-multiple', {
    method: 'DELETE',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ keys }),
  });
}

describe('batch storage deletion', () => {
  beforeEach(() => vi.clearAllMocks());

  it('reports partial S3 failure instead of confirming every object was deleted', async () => {
    mocks.send.mockResolvedValue({ Errors: [{ Key: 'owner/uploads/two', Code: 'AccessDenied' }] });
    const response = await DELETE(request());
    expect(response.status).toBe(502);
    expect(await response.json()).toMatchObject({ success: false, failedKeys: ['owner/uploads/two'] });
  });

  it('preserves success for an error-free quiet S3 response', async () => {
    mocks.send.mockResolvedValue({});
    const response = await DELETE(request());
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ success: true });
  });

  it('rejects another owner namespace before contacting S3', async () => {
    const response = await DELETE(request(['other-owner/uploads/one']));
    expect(response.status).toBe(403);
    expect(mocks.send).not.toHaveBeenCalled();
  });
});
