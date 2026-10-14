vi.mock('server-only', () => ({}));
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  elevenLabsTts: vi.fn(),
  elevenLabsStt: vi.fn(),
  pollyTts: vi.fn(),
}));

vi.mock('./elevenlabs', () => ({
  streamElevenLabsTextToSpeech: mocks.elevenLabsTts,
  transcribeElevenLabsSpeech: mocks.elevenLabsStt,
}));
vi.mock('./polly', () => ({ streamPollyTextToSpeech: mocks.pollyTts }));

import { createOxsigVoiceStream, transcribeOxsigVoice } from './server';

const audio = new Response(new Uint8Array([1, 2, 3]), {
  headers: { 'content-type': 'audio/mpeg' },
});

describe('OXSIG voice provider routing', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.stubEnv('OXSIG_VOICE_TTS_PROVIDER', '');
    vi.stubEnv('OXSIG_VOICE_TTS_FALLBACK_PROVIDER', '');
    vi.stubEnv('OXSIG_POLLY_REGION', '');
    vi.stubEnv('OXSIG_POLLY_VOICE_ID', '');
    vi.stubEnv('OXSIG_POLLY_ENGINE', '');
    vi.stubEnv('ELEVENLABS_API_KEY', 'test-key');
    vi.stubEnv('ELEVENLABS_VOICE_ID', 'test-voice');
    mocks.elevenLabsTts.mockResolvedValue(audio);
    mocks.pollyTts.mockResolvedValue(audio);
  });

  afterEach(() => vi.unstubAllEnvs());

  it('retains ElevenLabs by default, avoiding an unexpected production change', async () => {
    expect(await createOxsigVoiceStream('hello')).toBe(audio);
    expect(mocks.elevenLabsTts).toHaveBeenCalledTimes(1);
    expect(mocks.pollyTts).not.toHaveBeenCalled();
  });

  it('uses Polly when selected, without requiring ElevenLabs credentials', async () => {
    vi.stubEnv('OXSIG_VOICE_TTS_PROVIDER', 'polly');
    vi.stubEnv('ELEVENLABS_API_KEY', '');
    expect(await createOxsigVoiceStream('hello')).toBe(audio);
    expect(mocks.pollyTts).toHaveBeenCalledWith({
      text: 'hello',
      region: 'eu-central-1',
      voiceId: 'Joanna',
      engine: 'neural',
    });
    expect(mocks.elevenLabsTts).not.toHaveBeenCalled();
  });

  it('falls back to Polly when ElevenLabs quota or provider fails', async () => {
    vi.stubEnv('OXSIG_VOICE_TTS_FALLBACK_PROVIDER', 'polly');
    mocks.elevenLabsTts.mockRejectedValue(new Error('Quota exceeded'));
    expect(await createOxsigVoiceStream('hello')).toBe(audio);
    expect(mocks.elevenLabsTts).toHaveBeenCalledTimes(1);
    expect(mocks.pollyTts).toHaveBeenCalledTimes(1);
  });

  it('falls back to ElevenLabs if Polly has a provider failure', async () => {
    vi.stubEnv('OXSIG_VOICE_TTS_PROVIDER', 'polly');
    vi.stubEnv('OXSIG_VOICE_TTS_FALLBACK_PROVIDER', 'elevenlabs');
    mocks.pollyTts.mockRejectedValue(new Error('Throttled'));
    expect(await createOxsigVoiceStream('hello')).toBe(audio);
    expect(mocks.elevenLabsTts).toHaveBeenCalledTimes(1);
  });

  it('never retries the same provider or silently accepts unsupported names', async () => {
    vi.stubEnv('OXSIG_VOICE_TTS_PROVIDER', 'polly');
    vi.stubEnv('OXSIG_VOICE_TTS_FALLBACK_PROVIDER', 'polly');
    mocks.pollyTts.mockRejectedValue(new Error('Throttled'));
    await expect(createOxsigVoiceStream('hello')).rejects.toThrow('Throttled');
    expect(mocks.pollyTts).toHaveBeenCalledTimes(1);
    vi.stubEnv('OXSIG_VOICE_TTS_PROVIDER', 'unknown');
    await expect(createOxsigVoiceStream('hello')).rejects.toThrow('Invalid voice TTS provider');
  });

  it('keeps the speech-to-text route unchanged until a tested AWS STT adapter exists', async () => {
    const blob = new Blob([new Uint8Array([1])], { type: 'audio/webm' });
    mocks.elevenLabsStt.mockResolvedValue({ text: 'hello', languageCode: 'en' });
    expect(await transcribeOxsigVoice(blob, 'sample.webm')).toEqual({ text: 'hello', languageCode: 'en' });
    expect(mocks.elevenLabsStt).toHaveBeenCalledTimes(1);
  });
});
