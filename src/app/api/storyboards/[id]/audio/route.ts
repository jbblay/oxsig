import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth/middleware';
import { getPool } from '@/lib/db/pool';
import { logAudit, getRequestMetadata, AUDIT_ACTIONS } from '@/lib/audit/logger';
import { storyboardIdSchema } from '@/lib/storyboards/validation';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  return requireAuth(request, async (req, user) => {
    const { id } = await params;
    if (!storyboardIdSchema.safeParse(id).success) {
      return NextResponse.json({ error: 'Invalid storyboard ID' }, { status: 400 });
    }

    try {
      const result = await getPool().query(
        `SELECT s.audio_data, s.audio_mime_type, s.audio_size
         FROM storyboard_sessions s
         LEFT JOIN storyboard_shares share
           ON share.session_id = s.id
          AND share.user_id = $2
          AND share.revoked_at IS NULL
          AND (share.expires_at IS NULL OR share.expires_at > NOW())
         WHERE s.id = $1 AND s.deleted_at IS NULL
           AND (s.owner_id = $2 OR share.user_id = $2)
         LIMIT 1`,
        [id, user.id]
      );
      if (!result.rows[0]) return NextResponse.json({ error: 'Storyboard not found' }, { status: 404 });
      if (!result.rows[0].audio_data) {
        return NextResponse.json({ error: 'Storyboard has no audio' }, { status: 404 });
      }

      await logAudit({
        userId: user.id,
        action: AUDIT_ACTIONS.STORYBOARD_AUDIO_OPEN,
        resourceType: 'storyboard',
        resourceId: id,
        ...getRequestMetadata(req),
      });

      return new NextResponse(result.rows[0].audio_data, {
        headers: {
          'Content-Type': result.rows[0].audio_mime_type,
          'Content-Length': String(result.rows[0].audio_size),
          'Cache-Control': 'private, no-store',
          'Content-Disposition': `inline; filename="storyboard-${id}"`,
          'X-Content-Type-Options': 'nosniff',
        },
      });
    } catch (error) {
      console.error('Failed to load storyboard audio:', error);
      return NextResponse.json({ error: 'Failed to load storyboard audio' }, { status: 500 });
    }
  });
}
