import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { NextRequest } from 'next/server';

const mocks = vi.hoisted(() => ({
  query: vi.fn(), verify: vi.fn(), upload: vi.fn(), remove: vi.fn(), access: vi.fn(),
}));
vi.mock('server-only', () => ({}));
vi.mock('@/lib/auth/middleware', () => ({
  requireAuth: (req: NextRequest, handler: Function) => handler(req, { id: 'owner' }),
}));
vi.mock('@/lib/security/csrf', () => ({ validateCsrfToken: async () => true }));
vi.mock('@/lib/security/rate-limit', () => ({ checkRateLimit: async () => null }));
vi.mock('@/lib/db/pool', () => ({ getPool: () => ({ query: mocks.query }) }));
vi.mock('@/lib/audit/logger', () => ({ logAudit: vi.fn(), getRequestMetadata: vi.fn(), AUDIT_ACTIONS: {} }));
vi.mock('@/lib/storyboards/server', () => ({ getStoryboardAccess: mocks.access, mapStoryboardRow: vi.fn(), listStoryboardsForUser: vi.fn() }));
vi.mock('@/lib/storyboards/audio-storage', () => ({
  verifyStoryboardAudioReference: mocks.verify,
  uploadLegacyStoryboardAudio: mocks.upload,
  deleteStoryboardAudioObject: mocks.remove,
}));

import { POST } from './route';
import { PATCH } from './[id]/route';

const reference = { key: 'storyboards/audio/owner/existing.webm', size: 4, mimeType: 'audio/webm' };
const context = { params: Promise.resolve({ id: '11111111-1111-4111-8111-111111111111' }) };

function request(legacy = false) {
  const form = new FormData();
  form.set('metadata', JSON.stringify({ title: 'Board', durationMs: 0, events: [] }));
  if (legacy) form.set('audio', new File(['test'], 'new.webm', { type: 'audio/webm' }));
  else form.set('audioStorage', JSON.stringify(reference));
  return { formData: async () => form } as unknown as NextRequest;
}

describe('Storyboard save failure audio cleanup', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.verify.mockResolvedValue({ ...reference, etag: 'existing-etag' });
    mocks.upload.mockResolvedValue({ ...reference, key: 'storyboards/audio/owner/new.webm', etag: 'new-etag' });
    mocks.remove.mockResolvedValue(undefined);
    mocks.access.mockResolvedValue({ permission: 'owner', ownerName: 'Owner' });
    mocks.query.mockImplementation(async (sql: string) => {
      if (sql.trim().startsWith('SELECT')) return { rows: [{ audio_storage_key: reference.key }] };
      throw Object.assign(new Error('duplicate key'), { code: '23505' });
    });
  });

  it('preserves referenced audio when a create retry hits the unique key constraint', async () => {
    expect((await POST(request())).status).toBe(500);
    expect(mocks.verify).toHaveBeenCalled();
    expect(mocks.remove).not.toHaveBeenCalled();
  });

  it('preserves referenced audio when an update fails', async () => {
    expect((await PATCH(request(), context)).status).toBe(500);
    expect(mocks.verify).toHaveBeenCalled();
    expect(mocks.remove).not.toHaveBeenCalled();
  });

  it.each(['create', 'update'])('cleans only audio newly uploaded by the failed %s request', async (action) => {
    const response = action === 'create' ? await POST(request(true)) : await PATCH(request(true), context);
    expect(response.status).toBe(500);
    expect(mocks.upload).toHaveBeenCalled();
    expect(mocks.remove).toHaveBeenCalledWith('storyboards/audio/owner/new.webm');
  });
});
