import { describe, expect, it, vi } from 'vitest';
import { listElevenLabsVoices } from './elevenlabs-voices-lib.mjs';

function response(body, { ok = true, status = 200 } = {}) {
  return {
    ok,
    status,
    json: async () => body,
  };
}

describe('listElevenLabsVoices', () => {
  it('loads every page, sends the API key server-side, and deduplicates voice ids', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(response({
        voices: [
          { voice_id: 'voice-b', name: 'Bravo', category: 'premade' },
          { voice_id: 'voice-a', name: 'Alpha', category: 'professional' },
        ],
        has_more: true,
        next_page_token: 'page-2',
      }))
      .mockResolvedValueOnce(response({
        voices: [
          { voice_id: 'voice-a', name: 'Alpha duplicate', category: 'professional' },
          { voice_id: 'voice-c', name: 'Charlie', category: 'generated' },
        ],
        has_more: false,
        next_page_token: null,
      }));

    const voices = await listElevenLabsVoices({ apiKey: 'secret-key', fetchImpl });

    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(fetchImpl.mock.calls[0][1].headers['xi-api-key']).toBe('secret-key');
    expect(new URL(fetchImpl.mock.calls[1][0]).searchParams.get('next_page_token')).toBe('page-2');
    expect(voices).toEqual([
      { voiceId: 'voice-a', name: 'Alpha', category: 'professional' },
      { voiceId: 'voice-b', name: 'Bravo', category: 'premade' },
      { voiceId: 'voice-c', name: 'Charlie', category: 'generated' },
    ]);
  });

  it('passes an optional voice search term to ElevenLabs', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(response({ voices: [], has_more: false }));

    await listElevenLabsVoices({ apiKey: 'secret-key', search: 'Rachel', fetchImpl });

    expect(new URL(fetchImpl.mock.calls[0][0]).searchParams.get('search')).toBe('Rachel');
  });

  it('surfaces a provider error without exposing the API key', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(response(
      { detail: { message: 'Invalid API key' } },
      { ok: false, status: 401 }
    ));

    await expect(listElevenLabsVoices({ apiKey: 'do-not-print-me', fetchImpl }))
      .rejects.toThrow('Invalid API key');
  });

  it('requires ELEVENLABS_API_KEY before making a request', async () => {
    const fetchImpl = vi.fn();

    await expect(listElevenLabsVoices({ apiKey: '', fetchImpl }))
      .rejects.toThrow('ELEVENLABS_API_KEY is not configured.');
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});
