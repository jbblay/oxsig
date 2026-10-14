import 'server-only';

import { streamElevenLabsTextToSpeech, transcribeElevenLabsSpeech } from './elevenlabs';
import { streamPollyTextToSpeech } from './polly';
import { transcribeAwsSpeech } from './transcribe';

type VoiceTtsProvider = 'elevenlabs' | 'polly';
type VoiceSttProvider = 'elevenlabs' | 'transcribe';
type PollyEngine = 'standard' | 'neural' | 'generative';

function voiceProvider(value: string, field: string): VoiceTtsProvider {
  if (value === 'elevenlabs' || value === 'polly') return value;
  throw new Error(`Invalid voice TTS provider in ${field}.`);
}

function voicePollyEngine(): PollyEngine {
  const value = process.env.OXSIG_POLLY_ENGINE?.trim().toLowerCase() || 'neural';
  if (value === 'standard' || value === 'neural' || value === 'generative') return value;
  throw new Error('Invalid OXSIG_POLLY_ENGINE setting.');
}

export function elevenLabsVoiceConfigured() {
  return Boolean(process.env.ELEVENLABS_API_KEY?.trim() && process.env.ELEVENLABS_VOICE_ID?.trim());
}

export function elevenLabsTranscriptionConfigured() {
  return Boolean(process.env.ELEVENLABS_API_KEY?.trim());
}

async function synthesizeWithProvider(provider: VoiceTtsProvider, text: string): Promise<Response> {
  if (provider === 'polly') {
    return streamPollyTextToSpeech({
      text,
      region: process.env.OXSIG_POLLY_REGION?.trim() || 'eu-central-1',
      voiceId: process.env.OXSIG_POLLY_VOICE_ID?.trim() || 'Joanna',
      engine: voicePollyEngine(),
    });
  }
  return streamElevenLabsTextToSpeech({
    apiKey: process.env.ELEVENLABS_API_KEY || '',
    voiceId: process.env.ELEVENLABS_VOICE_ID || '',
    modelId: process.env.ELEVENLABS_TTS_MODEL?.trim() || 'eleven_multilingual_v2',
    text,
  });
}

/**
 * Default unchanged for existing deployments. A second provider is attempted
 * only when explicitly configured, and never on an ordinary successful call.
 */
export async function createOxsigVoiceStream(text: string): Promise<Response> {
  const primary = voiceProvider(
    process.env.OXSIG_VOICE_TTS_PROVIDER?.trim().toLowerCase() || 'elevenlabs',
    'OXSIG_VOICE_TTS_PROVIDER'
  );
  const fallbackValue = process.env.OXSIG_VOICE_TTS_FALLBACK_PROVIDER?.trim().toLowerCase() || '';
  const fallback = fallbackValue
    ? voiceProvider(fallbackValue, 'OXSIG_VOICE_TTS_FALLBACK_PROVIDER')
    : null;

  try {
    return await synthesizeWithProvider(primary, text);
  } catch (error) {
    if (!fallback || fallback === primary) throw error;
    // Never log user speech text, secrets or provider responses.
    console.warn(`[oxsig] Voice TTS provider ${primary} failed; attempting configured fallback ${fallback}.`);
    try {
      return await synthesizeWithProvider(fallback, text);
    } catch {
      throw new Error('Voice playback is temporarily unavailable. Please try again.');
    }
  }
}

function sttProvider(value: string, field: string): VoiceSttProvider {
  if (value === 'elevenlabs' || value === 'transcribe') return value;
  throw new Error(`Invalid speech-to-text provider in ${field}.`);
}

async function recognizeWithProvider(provider: VoiceSttProvider, audio: Blob, filename?: string) {
  if (provider === 'transcribe') {
    return transcribeAwsSpeech({
      audio,
      region: process.env.OXSIG_TRANSCRIBE_REGION?.trim() || 'eu-central-1',
      bucket: process.env.OXSIG_TRANSCRIBE_STORAGE_BUCKET?.trim()
        || process.env.STORAGE_BUCKET?.trim() || '',
      languageCode: process.env.OXSIG_TRANSCRIBE_LANGUAGE_CODE || '',
    });
  }
  return transcribeElevenLabsSpeech({
    apiKey: process.env.ELEVENLABS_API_KEY || '',
    modelId: process.env.ELEVENLABS_STT_MODEL?.trim() || 'scribe_v2',
    audio,
    filename,
  });
}

/** Preserve ElevenLabs STT by default; AWS Transcribe opt-in and fallback are explicit. */
export async function transcribeOxsigVoice(audio: Blob, filename?: string) {
  const primary = sttProvider(
    process.env.OXSIG_VOICE_STT_PROVIDER?.trim().toLowerCase() || 'elevenlabs',
    'OXSIG_VOICE_STT_PROVIDER'
  );
  const fallbackValue = process.env.OXSIG_VOICE_STT_FALLBACK_PROVIDER?.trim().toLowerCase() || '';
  const fallback = fallbackValue
    ? sttProvider(fallbackValue, 'OXSIG_VOICE_STT_FALLBACK_PROVIDER')
    : null;

  try {
    return await recognizeWithProvider(primary, audio, filename);
  } catch (error) {
    if (!fallback || fallback === primary) throw error;
    console.warn(`[oxsig] Speech-to-text provider ${primary} failed; attempting configured fallback ${fallback}.`);
    try {
      return await recognizeWithProvider(fallback, audio, filename);
    } catch {
      throw new Error('Voice transcription is temporarily unavailable. Please try again.');
    }
  }
}
