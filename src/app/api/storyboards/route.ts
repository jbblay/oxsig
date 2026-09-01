import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth/middleware';
import { getPool } from '@/lib/db/pool';
import { logAudit, getRequestMetadata, AUDIT_ACTIONS } from '@/lib/audit/logger';
import { checkRateLimit } from '@/lib/security/rate-limit';
import { validateCsrfToken } from '@/lib/security/csrf';
import { listStoryboardsForUser, mapStoryboardRow } from '@/lib/storyboards/server';
import {
  ALLOWED_STORYBOARD_AUDIO_TYPES,
  MAX_STORYBOARD_AUDIO_BYTES,
  storyboardSessionSchema,
} from '@/lib/storyboards/validation';

async function parseCreateRequest(request: NextRequest) {
  const form = await (request as Request).formData();
  const metadataValue = form.get('metadata');
  if (typeof metadataValue !== 'string') throw new Error('MISSING_METADATA');

  let metadata: unknown;
  try {
    metadata = JSON.parse(metadataValue);
  } catch {
    throw new Error('INVALID_METADATA');
  }

  const validation = storyboardSessionSchema.safeParse(metadata);
  if (!validation.success) {
    return { validationError: validation.error.flatten() } as const;
  }

  const audioValue = form.get('audio');
  const audio = audioValue instanceof File && audioValue.size > 0 ? audioValue : null;
  if (audio && audio.size > MAX_STORYBOARD_AUDIO_BYTES) throw new Error('AUDIO_TOO_LARGE');
  if (audio && !ALLOWED_STORYBOARD_AUDIO_TYPES.has(audio.type)) throw new Error('AUDIO_TYPE');

  return { data: validation.data, audio } as const;
}

export async function GET(request: NextRequest) {
  return requireAuth(request, async (req, user) => {
    const rateLimit = await checkRateLimit(req, { maxRequests: 100, windowMs: 60_000 }, user.id);
    if (rateLimit) return rateLimit;

    try {
      return NextResponse.json({ sessions: await listStoryboardsForUser(user.id) });
    } catch (error) {
      console.error('Failed to list storyboards:', error);
      return NextResponse.json({ error: 'Failed to list storyboards' }, { status: 500 });
    }
  });
}

export async function POST(request: NextRequest) {
  return requireAuth(request, async (req, user) => {
    if (!(await validateCsrfToken(req))) {
      return NextResponse.json({ error: 'Invalid or missing CSRF token' }, { status: 403 });
    }
    const rateLimit = await checkRateLimit(req, { maxRequests: 20, windowMs: 60_000 }, user.id);
    if (rateLimit) return rateLimit;

    try {
      const parsed = await parseCreateRequest(req);
      if ('validationError' in parsed) {
        return NextResponse.json(
          { error: 'Invalid storyboard', details: parsed.validationError },
          { status: 400 }
        );
      }

      const { data, audio } = parsed;
      const audioBuffer = audio ? Buffer.from(await audio.arrayBuffer()) : null;
      const result = await getPool().query(
        `INSERT INTO storyboard_sessions
           (owner_id, title, description, status, duration_ms, events,
            audio_data, audio_mime_type, audio_size)
         VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7, $8, $9)
         RETURNING id, owner_id, title, description, status, duration_ms, events,
           audio_data IS NOT NULL AS has_audio, audio_mime_type, audio_size,
           version, created_at, updated_at,
           $10::text AS owner_name, $11::text AS owner_email,
           NULL::text AS share_permission, $1::uuid AS request_user_id`,
        [
          user.id,
          data.title,
          data.description || null,
          data.status,
          data.durationMs,
          JSON.stringify(data.events),
          audioBuffer,
          audio?.type || null,
          audio?.size || null,
          user.name || user.email || 'OXSIG user',
          user.email || null,
        ]
      );

      const session = mapStoryboardRow(result.rows[0]);
      const requestMetadata = getRequestMetadata(req);
      await logAudit({
        userId: user.id,
        action: AUDIT_ACTIONS.STORYBOARD_CREATE,
        resourceType: 'storyboard',
        resourceId: session.id,
        ...requestMetadata,
        metadata: { eventCount: data.events.length, hasAudio: !!audio },
      });
      if (audio) {
        await logAudit({
          userId: user.id,
          action: AUDIT_ACTIONS.STORYBOARD_RECORDING_SAVED,
          resourceType: 'storyboard',
          resourceId: session.id,
          ...requestMetadata,
          metadata: { durationMs: data.durationMs, audioSize: audio.size },
        });
      }

      return NextResponse.json({ session }, { status: 201 });
    } catch (error) {
      const code = error instanceof Error ? error.message : '';
      if (code === 'MISSING_METADATA' || code === 'INVALID_METADATA') {
        return NextResponse.json({ error: 'Invalid storyboard metadata' }, { status: 400 });
      }
      if (code === 'AUDIO_TOO_LARGE') {
        return NextResponse.json({ error: 'Audio exceeds the 4 MiB MVP limit' }, { status: 413 });
      }
      if (code === 'AUDIO_TYPE') {
        return NextResponse.json({ error: 'Unsupported audio format' }, { status: 415 });
      }
      console.error('Failed to create storyboard:', error);
      return NextResponse.json({ error: 'Failed to create storyboard' }, { status: 500 });
    }
  });
}
