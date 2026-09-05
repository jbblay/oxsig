const ELEVENLABS_VOICES_URL = 'https://api.elevenlabs.io/v2/voices';

function providerErrorMessage(payload, status) {
  const detail = payload?.detail;
  if (typeof detail === 'string' && detail.trim()) return detail.trim();
  if (detail && typeof detail === 'object') {
    const message = detail.message || detail.status;
    if (typeof message === 'string' && message.trim()) return message.trim();
  }
  const message = payload?.message || payload?.error;
  if (typeof message === 'string' && message.trim()) return message.trim();
  return `ElevenLabs voice request failed (${status})`;
}

export async function listElevenLabsVoices({ apiKey, search = '', fetchImpl = fetch } = {}) {
  const key = String(apiKey || '').trim();
  if (!key) throw new Error('ELEVENLABS_API_KEY is not configured.');

  const voices = [];
  const seenVoiceIds = new Set();
  const seenPageTokens = new Set();
  let nextPageToken = null;

  do {
    const url = new URL(ELEVENLABS_VOICES_URL);
    url.searchParams.set('page_size', '100');
    url.searchParams.set('include_total_count', 'false');
    url.searchParams.set('sort', 'name');
    url.searchParams.set('sort_direction', 'asc');
    if (search.trim()) url.searchParams.set('search', search.trim());
    if (nextPageToken) url.searchParams.set('next_page_token', nextPageToken);

    const response = await fetchImpl(url, {
      method: 'GET',
      headers: {
        Accept: 'application/json',
        'xi-api-key': key,
      },
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(providerErrorMessage(payload, response.status));

    for (const voice of Array.isArray(payload?.voices) ? payload.voices : []) {
      const voiceId = typeof voice?.voice_id === 'string' ? voice.voice_id.trim() : '';
      if (!voiceId || seenVoiceIds.has(voiceId)) continue;
      seenVoiceIds.add(voiceId);
      voices.push({
        voiceId,
        name: typeof voice?.name === 'string' && voice.name.trim() ? voice.name.trim() : '(unnamed voice)',
        category: typeof voice?.category === 'string' && voice.category.trim() ? voice.category.trim() : 'unknown',
      });
    }

    const candidate = payload?.has_more && typeof payload?.next_page_token === 'string'
      ? payload.next_page_token.trim()
      : '';
    if (!candidate || seenPageTokens.has(candidate)) {
      nextPageToken = null;
    } else {
      seenPageTokens.add(candidate);
      nextPageToken = candidate;
    }
  } while (nextPageToken);

  return voices.sort((a, b) => a.name.localeCompare(b.name));
}
