import { NextRequest, NextResponse } from 'next/server';
import { GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { requireAuth } from '@/lib/auth/middleware';
import { validateCsrfToken } from '@/lib/security/csrf';
import {
  assertUserStorageKey,
  getStorageBucket,
  getStorageClient,
  storageErrorResponse,
} from '@/lib/storage/server';

export async function POST(request: NextRequest) {
  return requireAuth(request, async (req, user) => {
    if (!(await validateCsrfToken(req))) {
      return NextResponse.json(
        { error: 'Invalid or missing CSRF token' },
        { status: 403 }
      );
    }

    try {
      const body = await req.json().catch(() => null);
      const rawKey = typeof body?.key === 'string' ? body.key : '';
      const rawExpires = Number(body?.expiresIn || 900);

      if (!rawKey) {
        return NextResponse.json({ error: 'Missing key' }, { status: 400 });
      }

      const key = assertUserStorageKey(user.id, rawKey);
      const bucket = getStorageBucket();
      const expiresIn = Number.isFinite(rawExpires)
        ? Math.min(Math.max(Math.trunc(rawExpires), 60), 3600)
        : 900;

      const url = await getSignedUrl(
        getStorageClient(),
        new GetObjectCommand({ Bucket: bucket, Key: key }),
        { expiresIn }
      );

      return NextResponse.json({
        url,
        expiresAt: new Date(Date.now() + expiresIn * 1000).toISOString(),
      });
    } catch (error) {
      console.error('Storage presigned-url error:', error);
      const failure = storageErrorResponse(error);
      return NextResponse.json(failure.body, { status: failure.status });
    }
  });
}
