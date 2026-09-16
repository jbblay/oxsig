import { stringifyPostgresJson } from '@/lib/db/postgres-safe';
import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth/middleware';
import { getPool } from '@/lib/db/pool';
import { logAudit, getRequestMetadata, AUDIT_ACTIONS } from '@/lib/audit/logger';
import { validateCsrfToken } from '@/lib/security/csrf';
import { canEditStoryboard, canManageStoryboard } from '@/lib/storyboards/access';
import { getStoryboardAccess, mapStoryboardRow } from '@/lib/storyboards/server';
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
  storyboardIdSchema,
  storyboardSessionSchema,
} from '@/lib/storyboards/validation';

type RouteContext = { params: Promise<{ id: string }> };

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

async function parseUpdateRequest(req: NextRequest) {
  const form = await (req as Request).formData();
  const metadataValue = form.get('metadata');
  if (typeof metadataValue !== 'string') throw new Error('MISSING_METADATA');

  let rawMetadata: unknown;
  try {
    rawMetadata = JSON.parse(metadataValue);
  } catch {
    throw new Error('INVALID_METADATA');
  }
  const validation = storyboardSessionSchema.safeParse(rawMetadata);
  if (!validation.success) return { validationError: validation.error.flatten() } as const;

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

export async function GET(request: NextRequest, { params }: RouteContext) {
  return requireAuth(request, async (req, user) => {
    const { id } = await params;
    if (!storyboardIdSchema.safeParse(id).success) {
      return NextResponse.json({ error: 'Invalid storyboard ID' }, { status: 400 });
    }

    try {
      const session = await getStoryboardAccess(id, user.id);
      if (!session) return NextResponse.json({ error: 'Storyboard not found' }, { status: 404 });

      await logAudit({
        userId: user.id,
        action: AUDIT_ACTIONS.STORYBOARD_OPEN,
        resourceType: 'storyboard',
        resourceId: id,
        ...getRequestMetadata(req),
        metadata: { permission: session.permission },
      });
      return NextResponse.json({ session });
    } catch (error) {
      console.error('Failed to open storyboard:', error);
      return NextResponse.json({ error: 'Failed to open storyboard' }, { status: 500 });
    }
  });
}

export async function PATCH(request: NextRequest, { params }: RouteContext) {
  return requireAuth(request, async (req, user) => {
    if (!(await validateCsrfToken(req))) {
      return NextResponse.json({ error: 'Invalid or missing CSRF token' }, { status: 403 });
    }
    const { id } = await params;
    if (!storyboardIdSchema.safeParse(id).success) {
      return NextResponse.json({ error: 'Invalid storyboard ID' }, { status: 400 });
    }

    let materializedAudio: VerifiedStoryboardAudioReference | null = null;
    let audioCreatedByRequest = false;
    let oldStorageKey: string | null = null;
    let committed = false;
    try {
      const access = await getStoryboardAccess(id, user.id);
      if (!access) return NextResponse.json({ error: 'Storyboard not found' }, { status: 404 });
      if (!canEditStoryboard(access.permission)) {
        return NextResponse.json({ error: 'Editor permission required' }, { status: 403 });
      }

      const parsed = await parseUpdateRequest(req);
      if ('validationError' in parsed) {
        return NextResponse.json(
          { error: 'Invalid storyboard', details: parsed.validationError },
          { status: 400 }
        );
      }

      const existingAudio = await getPool().query(
        `SELECT audio_storage_key FROM storyboard_sessions
         WHERE id = $1 AND deleted_at IS NULL LIMIT 1`,
        [id]
      );
      oldStorageKey = existingAudio.rows[0]?.audio_storage_key || null;

      if (parsed.audioReference) {
        materializedAudio = await verifyStoryboardAudioReference(user.id, parsed.audioReference);
      } else if (parsed.legacyAudio) {
        materializedAudio = await uploadLegacyStoryboardAudio(
          user.id,
          parsed.legacyAudio,
          parsed.legacyAudio.name || 'storyboard-audio'
        );
        audioCreatedByRequest = true;
      }

      const data = parsed.data;
      const result = await getPool().query(
        `UPDATE storyboard_sessions
         SET title = $1, description = $2, status = $3, duration_ms = $4,
             events = $5::jsonb,
             audio_storage_key = CASE WHEN $6::text IS NULL THEN audio_storage_key ELSE $6 END,
             audio_storage_etag = CASE WHEN $6::text IS NULL THEN audio_storage_etag ELSE $7 END,
             audio_data = CASE WHEN $6::text IS NULL THEN audio_data ELSE NULL END,
             audio_mime_type = CASE WHEN $6::text IS NULL THEN audio_mime_type ELSE $8 END,
             audio_size = CASE WHEN $6::text IS NULL THEN audio_size ELSE $9 END,
             audio_stored_at = CASE WHEN $6::text IS NULL THEN audio_stored_at ELSE NOW() END,
             version = version + 1, updated_at = NOW()
         WHERE id = $10
           AND deleted_at IS NULL
           AND (
             owner_id = $14::uuid
             OR EXISTS (
               SELECT 1
               FROM storyboard_shares share
               WHERE share.session_id = storyboard_sessions.id
                 AND share.user_id = $14::uuid
                 AND share.permission = 'editor'
                 AND share.revoked_at IS NULL
                 AND (share.expires_at IS NULL OR share.expires_at > NOW())
             )
           )
         RETURNING id, owner_id, title, description, status, duration_ms, events,
           (audio_storage_key IS NOT NULL OR audio_data IS NOT NULL) AS has_audio,
           audio_mime_type, audio_size, version, created_at, updated_at,
           $11::text AS owner_name, $12::text AS owner_email,
           $13::text AS share_permission, $14::uuid AS request_user_id`,
        [
          data.title,
          data.description || null,
          data.status,
          data.durationMs,
          stringifyPostgresJson(data.events),
          materializedAudio?.key || null,
          materializedAudio?.etag || null,
          materializedAudio?.mimeType || null,
          materializedAudio?.size || null,
          id,
          access.ownerName,
          access.ownerEmail || null,
          access.permission === 'owner' ? null : access.permission,
          user.id,
        ]
      );

      if (!result.rows[0]) throw new Error('STORYBOARD_PERMISSION_CHANGED');
      committed = true;

      if (materializedAudio?.key && oldStorageKey && oldStorageKey !== materializedAudio.key) {
        await deleteStoryboardAudioObject(oldStorageKey).catch((cleanupError) => {
          console.warn('Failed to remove replaced Storyboard audio object:', cleanupError);
        });
      }

      const session = mapStoryboardRow(result.rows[0]);
      await logAudit({
        userId: user.id,
        action: AUDIT_ACTIONS.STORYBOARD_UPDATE,
        resourceType: 'storyboard',
        resourceId: id,
        ...getRequestMetadata(req),
        metadata: {
          eventCount: data.events.length,
          permission: access.permission,
          audioReplaced: Boolean(materializedAudio),
          audioStorage: materializedAudio ? 's3' : 'unchanged',
        },
      });
      if (materializedAudio) {
        await logAudit({
          userId: user.id,
          action: AUDIT_ACTIONS.STORYBOARD_RECORDING_SAVED,
          resourceType: 'storyboard',
          resourceId: id,
          ...getRequestMetadata(req),
          metadata: { durationMs: data.durationMs, audioSize: materializedAudio.size, storage: 's3' },
        });
      }
      return NextResponse.json({ session });
    } catch (error) {
      // Referenced audio can be live on another successful save or this Board.
      if (!committed && audioCreatedByRequest && materializedAudio?.key) {
        await deleteStoryboardAudioObject(materializedAudio.key).catch((cleanupError) => {
          console.warn('Failed to clean up uncommitted Storyboard audio:', cleanupError);
        });
      }
      const code = error instanceof Error ? error.message : '';
      if (code === 'MISSING_METADATA' || code === 'INVALID_METADATA') {
        return NextResponse.json({ error: 'Invalid storyboard metadata' }, { status: 400 });
      }
      if (code === 'STORYBOARD_PERMISSION_CHANGED') {
        return NextResponse.json(
          { error: 'Storyboard edit permission changed; reload and try again' },
          { status: 403 }
        );
      }
      const failure = audioFailure(error);
      if (failure) return NextResponse.json({ error: failure.message }, { status: failure.status });
      console.error('Failed to update storyboard:', error);
      return NextResponse.json({ error: 'Failed to update storyboard' }, { status: 500 });
    }
  });
}

export async function DELETE(request: NextRequest, { params }: RouteContext) {
  return requireAuth(request, async (req, user) => {
    if (!(await validateCsrfToken(req))) {
      return NextResponse.json({ error: 'Invalid or missing CSRF token' }, { status: 403 });
    }
    const { id } = await params;
    if (!storyboardIdSchema.safeParse(id).success) {
      return NextResponse.json({ error: 'Invalid storyboard ID' }, { status: 400 });
    }

    try {
      const access = await getStoryboardAccess(id, user.id);
      if (!access) return NextResponse.json({ error: 'Storyboard not found' }, { status: 404 });
      if (!canManageStoryboard(access.permission)) {
        return NextResponse.json({ error: 'Only the owner can delete this storyboard' }, { status: 403 });
      }

      const existing = await getPool().query(
        `SELECT audio_storage_key FROM storyboard_sessions
         WHERE id = $1 AND owner_id = $2 AND deleted_at IS NULL LIMIT 1`,
        [id, user.id]
      );
      const storageKey = existing.rows[0]?.audio_storage_key || null;

      await getPool().query(
        `UPDATE storyboard_sessions
         SET deleted_at = NOW(), updated_at = NOW(),
             audio_data = NULL, audio_storage_key = NULL, audio_storage_etag = NULL,
             audio_mime_type = NULL, audio_size = NULL, audio_stored_at = NULL
         WHERE id = $1 AND owner_id = $2 AND deleted_at IS NULL`,
        [id, user.id]
      );

      if (storageKey) {
        await deleteStoryboardAudioObject(storageKey).catch((cleanupError) => {
          console.warn('Failed to remove deleted Storyboard audio object:', cleanupError);
        });
      }

      await logAudit({
        userId: user.id,
        action: AUDIT_ACTIONS.STORYBOARD_DELETE,
        resourceType: 'storyboard',
        resourceId: id,
        ...getRequestMetadata(req),
      });
      return NextResponse.json({ success: true });
    } catch (error) {
      console.error('Failed to delete storyboard:', error);
      return NextResponse.json({ error: 'Failed to delete storyboard' }, { status: 500 });
    }
  });
}
