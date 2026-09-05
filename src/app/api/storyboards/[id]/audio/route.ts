import { NextRequest, NextResponse } from 'next/server';
import { GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { requireAuth } from '@/lib/auth/middleware';
import { getPool } from '@/lib/db/pool';
import { logAudit, getRequestMetadata, AUDIT_ACTIONS } from '@/lib/audit/logger';
import { checkRateLimit } from '@/lib/security/rate-limit';
import { storyboardIdSchema } from '@/lib/storyboards/validation';
import { getStorageBucket, getStorageClient, storageErrorResponse } from '@/lib/storage/server';

export const runtime = 'nodejs';

const DOWNLOAD_TTL_SECONDS = 60;

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  return requireAuth(request, async (req, user) => {
    const { id } = await params;
    if (!storyboardIdSchema.safeParse(id).success) {
      return NextResponse.json({ error: 'Invalid storyboard ID' }, { status: 400 });
    }

    const rateLimit = await checkRateLimit(
      req,
      { maxRequests: 120, windowMs: 60_000 },
      `${user.id}:${id}:storyboard-audio`
    );
    if (rateLimit) return rateLimit;

    try {
      const result = await getPool().query(
        `SELECT s.audio_storage_key, s.audio_data, s.audio_mime_type, s.audio_size
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
      const row = result.rows[0];
      if (!row) return NextResponse.json({ error: 'Storyboard not found' }, { status: 404 });
      if (!row.audio_storage_key && !row.audio_data) {
        return NextResponse.json({ error: 'Storyboard has no audio' }, { status: 404 });
      }

      await logAudit({
        userId: user.id,
        action: AUDIT_ACTIONS.STORYBOARD_AUDIO_OPEN,
        resourceType: 'storyboard',
        resourceId: id,
        ...getRequestMetadata(req),
        metadata: { storage: row.audio_storage_key ? 's3' : 'legacy-database' },
      });

      if (row.audio_storage_key) {
        try {
          const signedUrl = await getSignedUrl(
            getStorageClient(),
            new GetObjectCommand({
              Bucket: getStorageBucket(),
              Key: row.audio_storage_key,
              ResponseContentType: row.audio_mime_type || 'application/octet-stream',
              ResponseContentDisposition: `inline; filename="storyboard-${id}"`,
              ResponseCacheControl: 'private, no-store',
            }),
            { expiresIn: DOWNLOAD_TTL_SECONDS }
          );
          return NextResponse.redirect(signedUrl, 302);
        } catch (error) {
          console.error('Failed to sign Storyboard audio URL:', error);
          const failure = storageErrorResponse(error);
          return NextResponse.json(failure.body, { status: failure.status });
        }
      }

      return new NextResponse(row.audio_data, {
        headers: {
          'Content-Type': row.audio_mime_type,
          'Content-Length': String(row.audio_size),
          'Cache-Control': 'private, no-store',
          'Content-Disposition': `inline; filename="storyboard-${id}"`,
          'X-Content-Type-Options': 'nosniff',
          'X-OXSIG-Storage': 'legacy-database',
        },
      });
    } catch (error) {
      console.error('Failed to load storyboard audio:', error);
      return NextResponse.json({ error: 'Failed to load storyboard audio' }, { status: 500 });
    }
  });
}
