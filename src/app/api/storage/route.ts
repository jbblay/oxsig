import { NextRequest, NextResponse } from 'next/server';
import { DeleteObjectCommand } from '@aws-sdk/client-s3';
import { requireAuth } from '@/lib/auth/middleware';
import { validateCsrfToken } from '@/lib/security/csrf';
import {
  assertUserStorageKey,
  getStorageBucket,
  getStorageClient,
  storageErrorResponse,
} from '@/lib/storage/server';

export async function DELETE(request: NextRequest) {
  return requireAuth(request, async (req, user) => {
    if (!(await validateCsrfToken(req))) {
      return NextResponse.json(
        { error: 'Invalid or missing CSRF token' },
        { status: 403 }
      );
    }

    try {
      const url = new URL(req.url);
      const rawKey = url.searchParams.get('key');

      if (!rawKey) {
        return NextResponse.json({ error: 'Missing key' }, { status: 400 });
      }

      const key = assertUserStorageKey(user.id, rawKey);
      const bucket = getStorageBucket();

      await getStorageClient().send(
        new DeleteObjectCommand({ Bucket: bucket, Key: key })
      );

      return NextResponse.json({ success: true });
    } catch (error) {
      console.error('Storage delete error:', error);
      const failure = storageErrorResponse(error);
      return NextResponse.json(failure.body, { status: failure.status });
    }
  });
}
