import { getCsrfToken } from '@/lib/security/csrf-client';

export type OxsigVoiceTranscript = {
  transcript: string;
  languageCode: string | null;
};

async function voiceError(response: Response) {
  const body = await response.json().catch(() => ({}));
  return String(body?.error || `Voice request failed (${response.status})`);
}

function recordingFilename(type: string) {
  const normalized = type.trim().toLowerCase().split(';', 1)[0];
  switch (normalized) {
    case 'audio/mp4': return 'oxsig-recording.m4a';
    case 'audio/mpeg': return 'oxsig-recording.mp3';
    case 'audio/wav':
    case 'audio/x-wav': return 'oxsig-recording.wav';
    case 'audio/ogg': return 'oxsig-recording.ogg';
    case 'audio/aac': return 'oxsig-recording.aac';
    default: return 'oxsig-recording.webm';
  }
}

export async function requestOxsigVoiceAudio(text: string, signal?: AbortSignal): Promise<Blob> {
  const token = await getCsrfToken();
  const response = await fetch('/api/voice/tts', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-csrf-token': token,
    },
    body: JSON.stringify({ text }),
    signal,
  });

  if (!response.ok) throw new Error(await voiceError(response));
  const blob = await response.blob();
  if (!blob.size) throw new Error('Voice provider returned empty audio.');
  return blob;
}

export async function requestOxsigVoiceTranscript(audio: Blob, signal?: AbortSignal): Promise<OxsigVoiceTranscript> {
  if (!audio.size) throw new Error('Voice recording is empty.');

  const token = await getCsrfToken();
  const form = new FormData();
  form.set('audio', audio, recordingFilename(audio.type));
  const response = await fetch('/api/voice/stt', {
    method: 'POST',
    headers: { 'x-csrf-token': token },
    body: form,
    signal,
  });

  if (!response.ok) throw new Error(await voiceError(response));
  const body = await response.json().catch(() => ({}));
  const transcript = typeof body?.transcript === 'string' ? body.transcript.trim() : '';
  if (!transcript) throw new Error('Voice provider returned an empty transcript.');
  return {
    transcript,
    languageCode: typeof body?.languageCode === 'string' ? body.languageCode : null,
  };
}
