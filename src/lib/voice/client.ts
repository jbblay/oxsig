import { getCsrfToken } from '@/lib/security/csrf-client';

async function voiceError(response: Response) {
  const body = await response.json().catch(() => ({}));
  return String(body?.error || `Voice request failed (${response.status})`);
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
