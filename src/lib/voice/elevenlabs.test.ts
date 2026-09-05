import { describe, expect, it, vi } from 'vitest';
import { streamElevenLabsTextToSpeech, transcribeElevenLabsSpeech } from './elevenlabs';

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

describe('transcribeElevenLabsSpeech', () => {
  it('uploads the recording to the speech-to-text endpoint with Scribe', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response(
      JSON.stringify({ text: 'Why did that command fail?', language_code: 'en' }),
      { status: 200, headers: { 'content-type': 'application/json' } }
    ));
    const audio = new Blob([new Uint8Array([1, 2, 3])], { type: 'audio/webm' });

    const transcript = await transcribeElevenLabsSpeech({
      apiKey: 'secret-key',
      audio,
      filename: 'question.webm',
      modelId: 'scribe_v2',
      fetchImpl,
    });

    expect(transcript).toEqual({ text: 'Why did that command fail?', languageCode: 'en' });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const [url, init] = fetchImpl.mock.calls[0];
    expect(String(url)).toBe('https://api.elevenlabs.io/v1/speech-to-text');
    expect(init.headers['xi-api-key']).toBe('secret-key');
    expect(init.headers['Content-Type']).toBeUndefined();
    expect(init.body).toBeInstanceOf(FormData);
    expect(init.body.get('model_id')).toBe('scribe_v2');
    expect(init.body.get('tag_audio_events')).toBe('false');
    const uploaded = init.body.get('file');
    expect(uploaded).toBeInstanceOf(File);
    expect((uploaded as File).name).toBe('question.webm');
  });

  it('rejects empty recordings before contacting the provider', async () => {
    const fetchImpl = vi.fn();

    await expect(transcribeElevenLabsSpeech({
      apiKey: 'secret-key',
      audio: new Blob([], { type: 'audio/webm' }),
      fetchImpl,
    })).rejects.toThrow('Voice recording is empty.');
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('requires the server-side API key', async () => {
    const fetchImpl = vi.fn();

    await expect(transcribeElevenLabsSpeech({
      apiKey: '',
      audio: new Blob([new Uint8Array([1])], { type: 'audio/webm' }),
      fetchImpl,
    })).rejects.toThrow('ELEVENLABS_API_KEY is not configured.');
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('surfaces speech-to-text provider errors without exposing the key', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response(
      JSON.stringify({ detail: { message: 'Unsupported audio format' } }),
      { status: 400, headers: { 'content-type': 'application/json' } }
    ));

    await expect(transcribeElevenLabsSpeech({
      apiKey: 'do-not-print-me',
      audio: new Blob([new Uint8Array([1])], { type: 'audio/webm' }),
      fetchImpl,
    })).rejects.toThrow('Unsupported audio format');
  });

  it('rejects an empty successful transcript', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response(
      JSON.stringify({ text: '   ', language_code: 'en' }),
      { status: 200, headers: { 'content-type': 'application/json' } }
    ));

    await expect(transcribeElevenLabsSpeech({
      apiKey: 'secret-key',
      audio: new Blob([new Uint8Array([1])], { type: 'audio/webm' }),
      fetchImpl,
    })).rejects.toThrow('ElevenLabs returned an empty transcript.');
  });
});
