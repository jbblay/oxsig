import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';

const mocks = vi.hoisted(() => ({
  requireAuth: vi.fn(),
  validateCsrfToken: vi.fn(),
  checkRateLimit: vi.fn(),
  transcribeOxsigVoice: vi.fn(),
}));

vi.mock('@/lib/auth/middleware', () => ({ requireAuth: mocks.requireAuth }));
vi.mock('@/lib/security/csrf', () => ({ validateCsrfToken: mocks.validateCsrfToken }));
vi.mock('@/lib/security/rate-limit', () => ({ checkRateLimit: mocks.checkRateLimit }));
vi.mock('@/lib/voice/server', () => ({ transcribeOxsigVoice: mocks.transcribeOxsigVoice }));

import { POST } from './route';

const user = { id: 'user-1', role: 'user' as const };

function voiceRequest(file?: File) {
  const form = new FormData();
  if (file) form.set('audio', file, file.name);
  return new NextRequest('http://localhost/api/voice/stt', {
    method: 'POST',
    body: form,
  });
}

function recording(type = 'audio/webm') {
  return new File([new Uint8Array([1, 2, 3])], 'question.webm', { type });
}

describe('POST /api/voice/stt', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireAuth.mockImplementation(async (
      request: NextRequest,
      handler: (request: NextRequest, user: typeof user) => Promise<NextResponse>
    ) => handler(request, user));
    mocks.validateCsrfToken.mockResolvedValue(true);
    mocks.checkRateLimit.mockResolvedValue(null);
    mocks.transcribeOxsigVoice.mockResolvedValue({
      text: 'Why did that command fail?',
      languageCode: 'en',
    });
  });

  it('keeps authentication as the outer boundary', async () => {
    mocks.requireAuth.mockResolvedValue(
      NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    );

    const response = await POST(voiceRequest(recording()));

    expect(response.status).toBe(401);
    expect(mocks.validateCsrfToken).not.toHaveBeenCalled();
    expect(mocks.transcribeOxsigVoice).not.toHaveBeenCalled();
  });

  it('rejects a request that fails CSRF validation', async () => {
    mocks.validateCsrfToken.mockResolvedValue(false);

    const response = await POST(voiceRequest(recording()));

    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({ error: 'Invalid or missing CSRF token' });
    expect(mocks.checkRateLimit).not.toHaveBeenCalled();
    expect(mocks.transcribeOxsigVoice).not.toHaveBeenCalled();
  });

  it('returns the shared rate-limit response before parsing audio', async () => {
    mocks.checkRateLimit.mockResolvedValue(
      NextResponse.json({ error: 'Too many requests' }, { status: 429 })
    );

    const response = await POST(voiceRequest(recording()));

    expect(response.status).toBe(429);
    expect(mocks.checkRateLimit).toHaveBeenCalledWith(
      expect.any(NextRequest),
      { maxRequests: 12, windowMs: 60_000 },
      user.id
    );
    expect(mocks.transcribeOxsigVoice).not.toHaveBeenCalled();
  });

  it('requires an audio recording', async () => {
    const response = await POST(voiceRequest());

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: 'Voice recording is required' });
    expect(mocks.transcribeOxsigVoice).not.toHaveBeenCalled();
  });

  it('rejects unsupported recording formats', async () => {
    const response = await POST(voiceRequest(recording('text/plain')));

    expect(response.status).toBe(415);
    expect(await response.json()).toEqual({ error: 'Unsupported voice recording format' });
    expect(mocks.transcribeOxsigVoice).not.toHaveBeenCalled();
  });

  it('transcribes accepted browser audio and returns a no-store transcript', async () => {
    const response = await POST(voiceRequest(recording('audio/webm;codecs=opus')));

    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(await response.json()).toEqual({
      transcript: 'Why did that command fail?',
      languageCode: 'en',
    });
    expect(mocks.transcribeOxsigVoice).toHaveBeenCalledTimes(1);
    const [audio, filename] = mocks.transcribeOxsigVoice.mock.calls[0];
    expect(audio).toBeInstanceOf(File);
    expect(filename).toBe('oxsig-recording.webm');
  });

  it('maps provider failures to a bounded 502 response', async () => {
    mocks.transcribeOxsigVoice.mockRejectedValue(new Error('Upstream transcription unavailable'));

    const response = await POST(voiceRequest(recording()));

    expect(response.status).toBe(502);
    expect(await response.json()).toEqual({ error: 'Upstream transcription unavailable' });
  });
});
