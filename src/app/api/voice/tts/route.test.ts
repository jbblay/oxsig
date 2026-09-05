import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';

const mocks = vi.hoisted(() => ({
  requireAuth: vi.fn(),
  validateCsrfToken: vi.fn(),
  checkRateLimit: vi.fn(),
  createOxsigVoiceStream: vi.fn(),
}));

vi.mock('@/lib/auth/middleware', () => ({ requireAuth: mocks.requireAuth }));
vi.mock('@/lib/security/csrf', () => ({ validateCsrfToken: mocks.validateCsrfToken }));
vi.mock('@/lib/security/rate-limit', () => ({ checkRateLimit: mocks.checkRateLimit }));
vi.mock('@/lib/voice/server', () => ({ createOxsigVoiceStream: mocks.createOxsigVoiceStream }));

import { POST } from './route';

const user = { id: 'user-1', role: 'user' as const };

function voiceRequest(body: unknown) {
  return new NextRequest('http://localhost/api/voice/tts', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

function audioResponse() {
  return new Response(new Uint8Array([1, 2, 3]), {
    status: 200,
    headers: { 'content-type': 'audio/mpeg' },
  });
}

describe('POST /api/voice/tts', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireAuth.mockImplementation(async (
      request: NextRequest,
      handler: (request: NextRequest, user: typeof user) => Promise<NextResponse>
    ) => handler(request, user));
    mocks.validateCsrfToken.mockResolvedValue(true);
    mocks.checkRateLimit.mockResolvedValue(null);
    mocks.createOxsigVoiceStream.mockResolvedValue(audioResponse());
  });

  it('keeps authentication as the outer boundary', async () => {
    mocks.requireAuth.mockResolvedValue(
      NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    );

    const response = await POST(voiceRequest({ text: 'Explain this command.' }));

    expect(response.status).toBe(401);
    expect(mocks.validateCsrfToken).not.toHaveBeenCalled();
    expect(mocks.createOxsigVoiceStream).not.toHaveBeenCalled();
  });

  it('rejects a request that fails CSRF validation', async () => {
    mocks.validateCsrfToken.mockResolvedValue(false);

    const response = await POST(voiceRequest({ text: 'Explain this command.' }));

    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({ error: 'Invalid or missing CSRF token' });
    expect(mocks.checkRateLimit).not.toHaveBeenCalled();
    expect(mocks.createOxsigVoiceStream).not.toHaveBeenCalled();
  });

  it('returns the shared rate-limit response before contacting ElevenLabs', async () => {
    mocks.checkRateLimit.mockResolvedValue(
      NextResponse.json({ error: 'Too many requests' }, { status: 429 })
    );

    const response = await POST(voiceRequest({ text: 'Explain this command.' }));

    expect(response.status).toBe(429);
    expect(mocks.checkRateLimit).toHaveBeenCalledWith(
      expect.any(NextRequest),
      { maxRequests: 30, windowMs: 60_000 },
      user.id
    );
    expect(mocks.createOxsigVoiceStream).not.toHaveBeenCalled();
  });

  it('rejects invalid or empty narration payloads', async () => {
    const response = await POST(voiceRequest({ text: '   ' }));

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: 'Invalid voice request' });
    expect(mocks.createOxsigVoiceStream).not.toHaveBeenCalled();
  });

  it('streams provider audio with no-store and nosniff response headers', async () => {
    const response = await POST(voiceRequest({ text: 'Explain this command.' }));

    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toContain('audio/mpeg');
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(response.headers.get('x-content-type-options')).toBe('nosniff');
    expect(mocks.createOxsigVoiceStream).toHaveBeenCalledWith('Explain this command.');
    expect(new Uint8Array(await response.arrayBuffer())).toEqual(new Uint8Array([1, 2, 3]));
  });

  it('maps provider failures to a bounded 502 response', async () => {
    mocks.createOxsigVoiceStream.mockRejectedValue(new Error('Upstream voice provider unavailable'));

    const response = await POST(voiceRequest({ text: 'Explain this command.' }));

    expect(response.status).toBe(502);
    expect(await response.json()).toEqual({ error: 'Upstream voice provider unavailable' });
  });
});
