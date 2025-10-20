/**
 * Storage Metadata API - GET /api/storage/metadata?key=...&bucket=...
 */

import { NextRequest, NextResponse } from 'next/server';
import { S3Client, HeadObjectCommand } from '@aws-sdk/client-s3';

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

    const cmd = new HeadObjectCommand({ Bucket: bucket, Key: key });
    const res = await getS3Client().send(cmd);

    return NextResponse.json({
      id: key,
      key,
      bucket,
      filename: key.split('/').pop(),
      size: res.ContentLength || 0,
      mimeType: res.ContentType || 'application/octet-stream',
      url: `${process.env.MINIO_ENDPOINT || 'http://localhost:9000'}/${bucket}/${key}`,
      metadata: res.Metadata || {},
      encrypted: !!res.ServerSideEncryption,
      checksum: res.ETag || '',
      uploadedBy: res.Metadata?.uploadedby || '',
      createdAt: res.LastModified?.toISOString() || '',
    });
  } catch (error) {
    console.error('Storage metadata error:', error);
    return NextResponse.json(
      { error: 'Failed to get metadata', details: String(error) },
      { status: 500 }
    );
  }
}