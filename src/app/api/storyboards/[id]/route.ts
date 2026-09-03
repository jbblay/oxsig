import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth/middleware';
import { getPool } from '@/lib/db/pool';
import { logAudit, getRequestMetadata, AUDIT_ACTIONS } from '@/lib/audit/logger';
import { validateCsrfToken } from '@/lib/security/csrf';
import { canEditStoryboard, canManageStoryboard } from '@/lib/storyboards/access';
import { getStoryboardAccess, mapStoryboardRow } from '@/lib/storyboards/server';
import {
  ALLOWED_STORYBOARD_AUDIO_TYPES,
  MAX_STORYBOARD_AUDIO_BYTES,
  storyboardIdSchema,
  storyboardSessionSchema,
} from '@/lib/storyboards/validation';

type RouteContext = { params: Promise<{ id: string }> };

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

    try {
      const access = await getStoryboardAccess(id, user.id);
      if (!access) return NextResponse.json({ error: 'Storyboard not found' }, { status: 404 });
      if (!canEditStoryboard(access.permission)) {
        return NextResponse.json({ error: 'Editor permission required' }, { status: 403 });
      }

      const form = await (req as Request).formData();
      const metadataValue = form.get('metadata');
      if (typeof metadataValue !== 'string') {
        return NextResponse.json({ error: 'Storyboard metadata is required' }, { status: 400 });
      }
      let rawMetadata: unknown;
      try {
        rawMetadata = JSON.parse(metadataValue);
      } catch {
        return NextResponse.json({ error: 'Invalid storyboard metadata' }, { status: 400 });
      }
      const validation = storyboardSessionSchema.safeParse(rawMetadata);
      if (!validation.success) {
        return NextResponse.json(
          { error: 'Invalid storyboard', details: validation.error.flatten() },
          { status: 400 }
        );
      }

      const audioValue = form.get('audio');
      const audio = audioValue instanceof File && audioValue.size > 0 ? audioValue : null;
      if (audio && audio.size > MAX_STORYBOARD_AUDIO_BYTES) {
        return NextResponse.json({ error: 'Audio exceeds the 4 MiB MVP limit' }, { status: 413 });
      }
      if (audio && !ALLOWED_STORYBOARD_AUDIO_TYPES.has(audio.type)) {
        return NextResponse.json({ error: 'Unsupported audio format' }, { status: 415 });
      }

      const data = validation.data;
      const audioBuffer = audio ? Buffer.from(await audio.arrayBuffer()) : null;
      const result = await getPool().query(
        `UPDATE storyboard_sessions
         SET title = $1, description = $2, status = $3, duration_ms = $4,
             events = $5::jsonb,
             audio_data = CASE WHEN $6::bytea IS NULL THEN audio_data ELSE $6 END,
             audio_mime_type = CASE WHEN $6::bytea IS NULL THEN audio_mime_type ELSE $7 END,
             audio_size = CASE WHEN $6::bytea IS NULL THEN audio_size ELSE $8 END,
             version = version + 1, updated_at = NOW()
         WHERE id = $9
           AND deleted_at IS NULL
           AND (
             owner_id = $13::uuid
             OR EXISTS (
               SELECT 1
               FROM storyboard_shares share
               WHERE share.session_id = storyboard_sessions.id
                 AND share.user_id = $13::uuid
                 AND share.permission = 'editor'
                 AND share.revoked_at IS NULL
                 AND (share.expires_at IS NULL OR share.expires_at > NOW())
             )
           )
         RETURNING id, owner_id, title, description, status, duration_ms, events,
           audio_data IS NOT NULL AS has_audio, audio_mime_type, audio_size,
           version, created_at, updated_at,
           $10::text AS owner_name, $11::text AS owner_email,
           $12::text AS share_permission, $13::uuid AS request_user_id`,
        [
          data.title, data.description || null, data.status, data.durationMs,
          JSON.stringify(data.events), audioBuffer, audio?.type || null, audio?.size || null,
          id, access.ownerName, access.ownerEmail || null,
          access.permission === 'owner' ? null : access.permission, user.id,
        ]
      );

      if (!result.rows[0]) {
        return NextResponse.json(
          { error: 'Storyboard edit permission changed; reload and try again' },
          { status: 403 }
        );
      }

      const session = mapStoryboardRow(result.rows[0]);
      await logAudit({
        userId: user.id,
        action: AUDIT_ACTIONS.STORYBOARD_UPDATE,
        resourceType: 'storyboard',
        resourceId: id,
        ...getRequestMetadata(req),
        metadata: { eventCount: data.events.length, permission: access.permission },
      });
      return NextResponse.json({ session });
    } catch (error) {
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
      await getPool().query(
        `UPDATE storyboard_sessions SET deleted_at = NOW(), updated_at = NOW()
         WHERE id = $1 AND owner_id = $2 AND deleted_at IS NULL`,
        [id, user.id]
      );
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
