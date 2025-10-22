/**
 * Storage Presigned URL API - POST /api/storage/presigned-url
 */

import { NextRequest, NextResponse } from 'next/server';
import { S3Client, GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

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

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const key: string = body?.key;
    const bucket: string = body?.bucket || process.env.MINIO_BUCKET || 'oxsig-documents';
    const expiresIn: number = body?.expiresIn || 900;

    if (!key) {
      return NextResponse.json({ error: 'Missing key' }, { status: 400 });
    }

    const cmd = new GetObjectCommand({ Bucket: bucket, Key: key });
    const url = await getSignedUrl(getS3Client(), cmd, { expiresIn });

    return NextResponse.json({ url, expiresAt: new Date(Date.now() + expiresIn * 1000).toISOString() });
  } catch (error) {
    console.error('Storage presigned-url error:', error);
    return NextResponse.json(
      { error: 'Failed to generate presigned url', details: String(error) },
      { status: 500 }
    );
  }
}