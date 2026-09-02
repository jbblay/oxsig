import { NextRequest, NextResponse } from 'next/server';
import { HeadObjectCommand } from '@aws-sdk/client-s3';
import { requireAuth } from '@/lib/auth/middleware';
import {
  assertUserStorageKey,
  getStorageBucket,
  getStorageClient,
  storageDownloadPath,
  storageErrorResponse,
} from '@/lib/storage/server';

export async function GET(request: NextRequest) {
  return requireAuth(request, async (req, user) => {
    try {
      const url = new URL(req.url);
      const rawKey = url.searchParams.get('key');

      if (!rawKey) {
        return NextResponse.json({ error: 'Missing key' }, { status: 400 });
      }

      const key = assertUserStorageKey(user.id, rawKey);
      const bucket = getStorageBucket();
      const result = await getStorageClient().send(
        new HeadObjectCommand({ Bucket: bucket, Key: key })
      );

      return NextResponse.json({
        id: key,
        key,
        bucket,
        filename: key.split('/').pop() || '',
        size: result.ContentLength || 0,
        mimeType: result.ContentType || 'application/octet-stream',
        url: storageDownloadPath(key),
        metadata: result.Metadata || {},
        encrypted: Boolean(result.ServerSideEncryption),
        checksum: result.ETag || '',
        uploadedBy: result.Metadata?.uploadedby || user.id,
        createdAt: result.LastModified?.toISOString() || '',
      });
    } catch (error) {
      console.error('Storage metadata error:', error);
      const failure = storageErrorResponse(error);
      return NextResponse.json(failure.body, { status: failure.status });
    }
  });
}
