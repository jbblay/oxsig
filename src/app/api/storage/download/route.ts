import { NextRequest, NextResponse } from 'next/server';
import { GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { requireAuth } from '@/lib/auth/middleware';
import { checkRateLimit } from '@/lib/security/rate-limit';
import {
  assertUserStorageKey,
  getStorageBucket,
  getStorageClient,
  storageDisplayFilename,
  storageErrorResponse,
} from '@/lib/storage/server';

const DOWNLOAD_URL_TTL_SECONDS = 60;

export async function GET(request: NextRequest) {
  return requireAuth(request, async (req, user) => {
    const rateLimit = await checkRateLimit(
      req,
      { maxRequests: 60, windowMs: 60_000 },
      user.id
    );
    if (rateLimit) return rateLimit;

    try {
      const url = new URL(req.url);
      const rawKey = url.searchParams.get('key');

      if (!rawKey) {
        return NextResponse.json({ error: 'Missing key' }, { status: 400 });
      }

      const key = assertUserStorageKey(user.id, rawKey);
      const bucket = getStorageBucket();
      const filename = storageDisplayFilename(key);
      const signedUrl = await getSignedUrl(
        getStorageClient(),
        new GetObjectCommand({
          Bucket: bucket,
          Key: key,
          ResponseContentDisposition: `attachment; filename="${filename}"`,
          ResponseCacheControl: 'private, no-store',
        }),
        { expiresIn: DOWNLOAD_URL_TTL_SECONDS }
      );

      return NextResponse.redirect(signedUrl, 302);
    } catch (error) {
      console.error('Storage download presign error:', error);
      const failure = storageErrorResponse(error);
      return NextResponse.json(failure.body, { status: failure.status });
    }
  });
}
