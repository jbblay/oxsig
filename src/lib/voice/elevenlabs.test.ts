import { describe, expect, it, vi } from 'vitest';
import { streamElevenLabsTextToSpeech } from './elevenlabs';

function audioResponse() {
  return new Response(new Uint8Array([1, 2, 3]), {
    status: 200,
    headers: { 'content-type': 'audio/mpeg' },
  });
}

describe('streamElevenLabsTextToSpeech', () => {
  it('sends the configured voice, model and API key to the streaming endpoint', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(audioResponse());

    await streamElevenLabsTextToSpeech({
      apiKey: 'secret-key',
      voiceId: 'voice-id',
      modelId: 'eleven_multilingual_v2',
      text: 'Teach this lesson.',
      fetchImpl,
    });

    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const [url, init] = fetchImpl.mock.calls[0];
    expect(String(url)).toContain('/v1/text-to-speech/voice-id/stream');
    expect(new URL(String(url)).searchParams.get('output_format')).toBe('mp3_44100_128');
    expect(init.headers['xi-api-key']).toBe('secret-key');
    expect(JSON.parse(init.body)).toEqual({
      text: 'Teach this lesson.',
      model_id: 'eleven_multilingual_v2',
    });
  });

  it('requires both server-side ElevenLabs settings before requesting audio', async () => {
    const fetchImpl = vi.fn();

    await expect(streamElevenLabsTextToSpeech({ apiKey: '', voiceId: 'voice', text: 'hello', fetchImpl }))
      .rejects.toThrow('ELEVENLABS_API_KEY is not configured.');
    await expect(streamElevenLabsTextToSpeech({ apiKey: 'key', voiceId: '', text: 'hello', fetchImpl }))
      .rejects.toThrow('ELEVENLABS_VOICE_ID is not configured.');
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('surfaces provider errors without including the API key', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response(
      JSON.stringify({ detail: { message: 'Voice not found' } }),
      { status: 404, headers: { 'content-type': 'application/json' } }
    ));

    await expect(streamElevenLabsTextToSpeech({
      apiKey: 'do-not-print-me',
      voiceId: 'missing',
      text: 'hello',
      fetchImpl,
    })).rejects.toThrow('Voice not found');
  });
});
