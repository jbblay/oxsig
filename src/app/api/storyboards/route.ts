import { stringifyPostgresJson } from '@/lib/db/postgres-safe';
import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth/middleware';
import { getPool } from '@/lib/db/pool';
import { logAudit, getRequestMetadata, AUDIT_ACTIONS } from '@/lib/audit/logger';
import { checkRateLimit } from '@/lib/security/rate-limit';
import { validateCsrfToken } from '@/lib/security/csrf';
import { listStoryboardsForUser, mapStoryboardRow } from '@/lib/storyboards/server';
import {
  deleteStoryboardAudioObject,
  uploadLegacyStoryboardAudio,
  verifyStoryboardAudioReference,
  type VerifiedStoryboardAudioReference,
} from '@/lib/storyboards/audio-storage';
import {
  ALLOWED_STORYBOARD_AUDIO_TYPES,
  LEGACY_STORYBOARD_AUDIO_BYTES,
  storyboardAudioReferenceSchema,
  storyboardSessionSchema,
} from '@/lib/storyboards/validation';

export const runtime = 'nodejs';

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

  let audioReference = null;
  const audioStorageValue = form.get('audioStorage');
  if (typeof audioStorageValue === 'string' && audioStorageValue.trim()) {
    let rawReference: unknown;
    try {
      rawReference = JSON.parse(audioStorageValue);
    } catch {
      throw new Error('INVALID_AUDIO_REFERENCE');
    }
    const parsedReference = storyboardAudioReferenceSchema.safeParse(rawReference);
    if (!parsedReference.success) throw new Error('INVALID_AUDIO_REFERENCE');
    audioReference = parsedReference.data;
  }

  const audioValue = form.get('audio');
  const legacyAudio = audioValue instanceof File && audioValue.size > 0 ? audioValue : null;
  if (audioReference && legacyAudio) throw new Error('MULTIPLE_AUDIO_SOURCES');
  if (legacyAudio && legacyAudio.size > LEGACY_STORYBOARD_AUDIO_BYTES) throw new Error('LEGACY_AUDIO_TOO_LARGE');
  if (legacyAudio && !ALLOWED_STORYBOARD_AUDIO_TYPES.has(legacyAudio.type)) throw new Error('AUDIO_TYPE');

  return { data: validation.data, audioReference, legacyAudio } as const;
}

function audioFailure(error: unknown): { status: number; message: string } | null {
  const code = error instanceof Error ? error.message : '';
  if (['INVALID_AUDIO_REFERENCE', 'INVALID_STORYBOARD_AUDIO_REFERENCE', 'INVALID_STORYBOARD_AUDIO_KEY', 'STORYBOARD_AUDIO_OBJECT_MISMATCH', 'MULTIPLE_AUDIO_SOURCES'].includes(code)) {
    return { status: 400, message: 'Invalid Storyboard audio reference' };
  }
  if (['LEGACY_AUDIO_TOO_LARGE', 'LEGACY_STORYBOARD_AUDIO_TOO_LARGE', 'STORYBOARD_AUDIO_TOO_LARGE'].includes(code)) {
    return { status: 413, message: 'Storyboard audio exceeds the configured upload limit' };
  }
  if (['AUDIO_TYPE', 'STORYBOARD_AUDIO_TYPE'].includes(code)) {
    return { status: 415, message: 'Unsupported audio format' };
  }
  return null;
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

    let materializedAudio: VerifiedStoryboardAudioReference | null = null;
    let committed = false;
    try {
      const parsed = await parseCreateRequest(req);
      if ('validationError' in parsed) {
        return NextResponse.json(
          { error: 'Invalid storyboard', details: parsed.validationError },
          { status: 400 }
        );
      }

      const { data, audioReference, legacyAudio } = parsed;
      if (audioReference) {
        materializedAudio = await verifyStoryboardAudioReference(user.id, audioReference);
      } else if (legacyAudio) {
        materializedAudio = await uploadLegacyStoryboardAudio(user.id, legacyAudio, legacyAudio.name || 'storyboard-audio');
      }

      const result = await getPool().query(
        `INSERT INTO storyboard_sessions
           (owner_id, title, description, status, duration_ms, events,
            audio_storage_key, audio_storage_etag, audio_mime_type, audio_size, audio_stored_at)
         VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7, $8, $9, $10,
                 CASE WHEN $7::text IS NULL THEN NULL ELSE NOW() END)
         RETURNING id, owner_id, title, description, status, duration_ms, events,
           (audio_storage_key IS NOT NULL OR audio_data IS NOT NULL) AS has_audio,
           audio_mime_type, audio_size, version, created_at, updated_at,
           $11::text AS owner_name, $12::text AS owner_email,
           NULL::text AS share_permission, $1::uuid AS request_user_id`,
        [
          user.id,
          data.title,
          data.description || null,
          data.status,
          data.durationMs,
          stringifyPostgresJson(data.events),
          materializedAudio?.key || null,
          materializedAudio?.etag || null,
          materializedAudio?.mimeType || null,
          materializedAudio?.size || null,
          user.name || user.email || 'OXSIG user',
          user.email || null,
        ]
      );
      committed = true;

      const session = mapStoryboardRow(result.rows[0]);
      const requestMetadata = getRequestMetadata(req);
      await logAudit({
        userId: user.id,
        action: AUDIT_ACTIONS.STORYBOARD_CREATE,
        resourceType: 'storyboard',
        resourceId: session.id,
        ...requestMetadata,
        metadata: { eventCount: data.events.length, hasAudio: Boolean(materializedAudio), audioStorage: materializedAudio ? 's3' : 'none' },
      });
      if (materializedAudio) {
        await logAudit({
          userId: user.id,
          action: AUDIT_ACTIONS.STORYBOARD_RECORDING_SAVED,
          resourceType: 'storyboard',
          resourceId: session.id,
          ...requestMetadata,
          metadata: { durationMs: data.durationMs, audioSize: materializedAudio.size, storage: 's3' },
        });
      }

      return NextResponse.json({ session }, { status: 201 });
    } catch (error) {
      if (!committed && materializedAudio?.key) {
        await deleteStoryboardAudioObject(materializedAudio.key).catch((cleanupError) => {
          console.warn('Failed to clean up uncommitted Storyboard audio:', cleanupError);
        });
      }
      const code = error instanceof Error ? error.message : '';
      if (code === 'MISSING_METADATA' || code === 'INVALID_METADATA') {
        return NextResponse.json({ error: 'Invalid storyboard metadata' }, { status: 400 });
      }
      const failure = audioFailure(error);
      if (failure) return NextResponse.json({ error: failure.message }, { status: failure.status });
      console.error('Failed to create storyboard:', error);
      return NextResponse.json({ error: 'Failed to create storyboard' }, { status: 500 });
    }
  });
}
