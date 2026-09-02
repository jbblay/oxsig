import { NextRequest, NextResponse } from 'next/server';
import { CopyObjectCommand } from '@aws-sdk/client-s3';
import { requireAuth } from '@/lib/auth/middleware';
import { validateCsrfToken } from '@/lib/security/csrf';
import {
  assertUserStorageKey,
  getStorageBucket,
  getStorageClient,
  storageDownloadPath,
  storageErrorResponse,
  toUserStorageKey,
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
      const sourceKey = typeof body?.sourceKey === 'string' ? body.sourceKey : '';
      const destKey = typeof body?.destKey === 'string' ? body.destKey : '';

      if (!sourceKey || !destKey) {
        return NextResponse.json(
          { error: 'Missing sourceKey or destKey' },
          { status: 400 }
        );
      }

      const source = assertUserStorageKey(user.id, sourceKey);
      const destination = toUserStorageKey(user.id, destKey);
      const bucket = getStorageBucket();
      const encodedSource = `${bucket}/${source
        .split('/')
        .map((segment) => encodeURIComponent(segment))
        .join('/')}`;

      await getStorageClient().send(
        new CopyObjectCommand({
          Bucket: bucket,
          CopySource: encodedSource,
          Key: destination,
        })
      );

      return NextResponse.json({
        id: destination,
        key: destination,
        bucket,
        filename: destination.split('/').pop() || '',
        size: 0,
        mimeType: 'application/octet-stream',
        url: storageDownloadPath(destination),
        metadata: {},
        encrypted: false,
        checksum: '',
        uploadedBy: user.id,
        createdAt: new Date().toISOString(),
      });
    } catch (error) {
      console.error('Storage copy error:', error);
      const failure = storageErrorResponse(error);
      return NextResponse.json(failure.body, { status: failure.status });
    }
  });
}
