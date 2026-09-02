import { NextRequest, NextResponse } from 'next/server';
import { GetObjectCommand } from '@aws-sdk/client-s3';
import { requireAuth } from '@/lib/auth/middleware';
import {
  assertUserStorageKey,
  getStorageBucket,
  getStorageClient,
  sanitizeStorageFilename,
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
      const response = await getStorageClient().send(
        new GetObjectCommand({ Bucket: bucket, Key: key })
      );

      if (!response.Body) {
        return NextResponse.json({ error: 'File not found' }, { status: 404 });
      }

      const chunks: Uint8Array[] = [];
      for await (const chunk of response.Body as AsyncIterable<Uint8Array>) {
        chunks.push(chunk);
      }
      const buffer = Buffer.concat(chunks);
      const filename = sanitizeStorageFilename(key.split('/').pop() || 'file');

      return new NextResponse(buffer, {
        headers: {
          'Content-Type': response.ContentType || 'application/octet-stream',
          'Content-Length': buffer.length.toString(),
          'Content-Disposition': `attachment; filename="${filename}"`,
          'Cache-Control': 'private, no-store',
        },
      });
    } catch (error) {
      console.error('Storage download error:', error);
      const failure = storageErrorResponse(error);
      return NextResponse.json(failure.body, { status: failure.status });
    }
  });
}
