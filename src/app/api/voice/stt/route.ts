import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth/middleware';
import { validateCsrfToken } from '@/lib/security/csrf';
import { checkRateLimit } from '@/lib/security/rate-limit';
import { transcribeOxsigVoice } from '@/lib/voice/server';

export const runtime = 'nodejs';

const MAX_AUDIO_BYTES = 10 * 1024 * 1024;
const ALLOWED_AUDIO_TYPES = [
  'audio/webm',
  'audio/mp4',
  'audio/mpeg',
  'audio/wav',
  'audio/x-wav',
  'audio/ogg',
  'audio/aac',
] as const;

function normalizedAudioType(value: string) {
  return value.trim().toLowerCase().split(';', 1)[0];
}

function validAudioType(value: string) {
  const type = normalizedAudioType(value);
  return ALLOWED_AUDIO_TYPES.some((allowed) => type === allowed);
}

function audioFilename(type: string) {
  switch (normalizedAudioType(type)) {
    case 'audio/mp4': return 'oxsig-recording.m4a';
    case 'audio/mpeg': return 'oxsig-recording.mp3';
    case 'audio/wav':
    case 'audio/x-wav': return 'oxsig-recording.wav';
    case 'audio/ogg': return 'oxsig-recording.ogg';
    case 'audio/aac': return 'oxsig-recording.aac';
    default: return 'oxsig-recording.webm';
  }
}

export async function POST(request: NextRequest) {
  return requireAuth(request, async (req, user) => {
    if (!(await validateCsrfToken(req))) {
      return NextResponse.json({ error: 'Invalid or missing CSRF token' }, { status: 403 });
    }

    const rateLimit = await checkRateLimit(req, { maxRequests: 12, windowMs: 60_000 }, user.id);
    if (rateLimit) return rateLimit;

    const declaredLength = Number(req.headers.get('content-length') || 0);
    if (Number.isFinite(declaredLength) && declaredLength > MAX_AUDIO_BYTES + 64 * 1024) {
      return NextResponse.json({ error: 'Voice recording is too large' }, { status: 413 });
    }

    let form: FormData;
    try {
      form = await (req as Request).formData();
    } catch {
      return NextResponse.json({ error: 'Invalid voice recording upload' }, { status: 400 });
    }

    const audio = form.get('audio');
    if (!(audio instanceof File) || audio.size === 0) {
      return NextResponse.json({ error: 'Voice recording is required' }, { status: 400 });
    }
    if (audio.size > MAX_AUDIO_BYTES) {
      return NextResponse.json({ error: 'Voice recording is too large' }, { status: 413 });
    }
    if (!validAudioType(audio.type)) {
      return NextResponse.json({ error: 'Unsupported voice recording format' }, { status: 415 });
    }

    try {
      const transcript = await transcribeOxsigVoice(audio, audioFilename(audio.type));
      return NextResponse.json(
        { transcript: transcript.text, languageCode: transcript.languageCode },
        { status: 200, headers: { 'Cache-Control': 'no-store' } }
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Voice transcription failed';
      return NextResponse.json({ error: message.slice(0, 500) }, { status: 502 });
    }
  });
}
