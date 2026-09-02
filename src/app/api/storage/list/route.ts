import { NextRequest, NextResponse } from 'next/server';
import { ListObjectsV2Command } from '@aws-sdk/client-s3';
import { requireAuth } from '@/lib/auth/middleware';
import {
  getStorageBucket,
  getStorageClient,
  getUserStoragePrefix,
  storageDownloadPath,
  storageErrorResponse,
  toUserStorageKey,
} from '@/lib/storage/server';

export async function GET(request: NextRequest) {
  return requireAuth(request, async (req, user) => {
    try {
      const url = new URL(req.url);
      const requestedPrefix = url.searchParams.get('prefix')?.trim() || '';
      const rawMaxKeys = Number(url.searchParams.get('maxKeys') || 100);
      const maxKeys = Number.isFinite(rawMaxKeys)
        ? Math.min(Math.max(Math.trunc(rawMaxKeys), 1), 1000)
        : 100;

      const bucket = getStorageBucket();
      const prefix = requestedPrefix
        ? toUserStorageKey(user.id, requestedPrefix)
        : getUserStoragePrefix(user.id);

      const result = await getStorageClient().send(
        new ListObjectsV2Command({ Bucket: bucket, Prefix: prefix, MaxKeys: maxKeys })
      );

      const objects =
        result.Contents?.map((object) => ({
          id: object.Key || '',
          key: object.Key || '',
          bucket,
          filename: object.Key?.split('/').pop() || '',
          size: object.Size || 0,
          mimeType: 'application/octet-stream',
          url: object.Key ? storageDownloadPath(object.Key) : '',
          metadata: {},
          encrypted: false,
          checksum: object.ETag || '',
          uploadedBy: user.id,
          createdAt: object.LastModified?.toISOString() || '',
        })) || [];

      return NextResponse.json(objects);
    } catch (error) {
      console.error('Storage list error:', error);
      const failure = storageErrorResponse(error);
      return NextResponse.json(failure.body, { status: failure.status });
    }
  });
}
