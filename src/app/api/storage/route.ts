/**
 * Storage API - DELETE /api/storage?key=...&bucket=...
 */

import { NextRequest, NextResponse } from 'next/server';
import { S3Client, DeleteObjectCommand } from '@aws-sdk/client-s3';

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

export async function DELETE(request: NextRequest) {
  try {
    const url = new URL(request.url);
    const key = url.searchParams.get('key');
    const bucket = url.searchParams.get('bucket') || process.env.MINIO_BUCKET || 'oxsig-documents';

    if (!key) {
      return NextResponse.json({ error: 'Missing key' }, { status: 400 });
    }

    await getS3Client().send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Storage delete error:', error);
    return NextResponse.json(
      { error: 'Failed to delete object', details: String(error) },
      { status: 500 }
    );
  }
}