import 'server-only';

import { streamElevenLabsTextToSpeech, transcribeElevenLabsSpeech } from './elevenlabs';

export function elevenLabsVoiceConfigured() {
  return Boolean(process.env.ELEVENLABS_API_KEY?.trim() && process.env.ELEVENLABS_VOICE_ID?.trim());
}

export function elevenLabsTranscriptionConfigured() {
  return Boolean(process.env.ELEVENLABS_API_KEY?.trim());
}

export async function createOxsigVoiceStream(text: string) {
  return streamElevenLabsTextToSpeech({
    apiKey: process.env.ELEVENLABS_API_KEY || '',
    voiceId: process.env.ELEVENLABS_VOICE_ID || '',
    modelId: process.env.ELEVENLABS_TTS_MODEL?.trim() || 'eleven_multilingual_v2',
    text,
  });
}

export async function transcribeOxsigVoice(audio: Blob, filename?: string) {
  return transcribeElevenLabsSpeech({
    apiKey: process.env.ELEVENLABS_API_KEY || '',
    modelId: process.env.ELEVENLABS_STT_MODEL?.trim() || 'scribe_v2',
    audio,
    filename,
  });
}
