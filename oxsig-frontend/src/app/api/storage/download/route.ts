/**
 * Storage Download API - GET /api/storage/download?key=...&bucket=...
 */

import { NextRequest, NextResponse } from 'next/server';
import { S3Client, GetObjectCommand } from '@aws-sdk/client-s3';

let s3Client: S3Client | null = null;
function getS3Client() {
  if (!s3Client) {
    s3Client = new S3Client({
      endpoint: process.env.MINIO_ENDPOINT || 'http://localhost:9000',
      region: process.env.MINIO_REGION || 'us-east-1',
      credentials: {
        accessKeyId: process.env.MINIO_ACCESS_KEY || 'minioadmin',
        secretAccessKey: process.env.MINIO_SECRET_KEY || 'minioadmin',
      },
      forcePathStyle: true,
    });
  }
  return s3Client;
}

export async function GET(request: NextRequest) {
  try {
    const url = new URL(request.url);
    const key = url.searchParams.get('key');
    const bucket = url.searchParams.get('bucket') || process.env.MINIO_BUCKET || 'oxsig-documents';

    if (!key) {
      return NextResponse.json({ error: 'Missing key' }, { status: 400 });
    }

    const cmd = new GetObjectCommand({ Bucket: bucket, Key: key });
    const response = await getS3Client().send(cmd);

    if (!response.Body) {
      return NextResponse.json({ error: 'File not found' }, { status: 404 });
    }

    const chunks: Uint8Array[] = [];
    for await (const chunk of response.Body as any) {
      chunks.push(chunk);
    }
    const buffer = Buffer.concat(chunks);

    return new NextResponse(buffer, {
      headers: {
        'Content-Type': response.ContentType || 'application/octet-stream',
        'Content-Length': buffer.length.toString(),
        'Content-Disposition': `attachment; filename="${key.split('/').pop() || 'file'}"`,
      },
    });
  } catch (error) {
    console.error('Storage download error:', error);
    return NextResponse.json(
      { error: 'Failed to download', details: String(error) },
      { status: 500 }
    );
  }
}