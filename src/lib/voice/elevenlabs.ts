export type ElevenLabsTtsOptions = {
  apiKey: string;
  voiceId: string;
  text: string;
  modelId?: string;
  fetchImpl?: typeof fetch;
};

function providerErrorMessage(payload: unknown, status: number) {
  if (payload && typeof payload === 'object') {
    const detail = (payload as { detail?: unknown }).detail;
    if (typeof detail === 'string' && detail.trim()) return detail.trim();
    if (detail && typeof detail === 'object') {
      const message = (detail as { message?: unknown; status?: unknown }).message
        ?? (detail as { status?: unknown }).status;
      if (typeof message === 'string' && message.trim()) return message.trim();
    }

    const message = (payload as { message?: unknown; error?: unknown }).message
      ?? (payload as { error?: unknown }).error;
    if (typeof message === 'string' && message.trim()) return message.trim();
  }

  return `ElevenLabs speech request failed (${status})`;
}

export async function streamElevenLabsTextToSpeech({
  apiKey,
  voiceId,
  text,
  modelId = 'eleven_multilingual_v2',
  fetchImpl = fetch,
}: ElevenLabsTtsOptions): Promise<Response> {
  const key = apiKey.trim();
  const voice = voiceId.trim();
  const spokenText = text.trim();

  if (!key) throw new Error('ELEVENLABS_API_KEY is not configured.');
  if (!voice) throw new Error('ELEVENLABS_VOICE_ID is not configured.');
  if (!spokenText) throw new Error('Voice text is empty.');

  const endpoint = new URL(`https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(voice)}/stream`);
  endpoint.searchParams.set('output_format', 'mp3_44100_128');

  const response = await fetchImpl(endpoint, {
    method: 'POST',
    headers: {
      Accept: 'audio/mpeg',
      'Content-Type': 'application/json',
      'xi-api-key': key,
    },
    body: JSON.stringify({
      text: spokenText,
      model_id: modelId.trim() || 'eleven_multilingual_v2',
    }),
  });

  if (!response.ok) {
    const payload = await response.json().catch(() => ({}));
    throw new Error(providerErrorMessage(payload, response.status));
  }
  if (!response.body) throw new Error('ElevenLabs returned no audio stream.');

  return response;
}
