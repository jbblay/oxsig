/**
 * Storage List API - GET /api/storage/list?bucket=&prefix=&maxKeys=
 */

import { NextRequest, NextResponse } from 'next/server';
import { S3Client, ListObjectsV2Command } from '@aws-sdk/client-s3';

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
    const bucket = url.searchParams.get('bucket') || process.env.MINIO_BUCKET || 'oxsig-documents';
    const prefix = url.searchParams.get('prefix') || undefined;
    const maxKeys = url.searchParams.get('maxKeys')
      ? parseInt(url.searchParams.get('maxKeys') as string)
      : undefined;

    const cmd = new ListObjectsV2Command({ Bucket: bucket, Prefix: prefix, MaxKeys: maxKeys });
    const res = await getS3Client().send(cmd);

    const minioEndpoint = process.env.MINIO_ENDPOINT || 'http://localhost:9000';
    const objects =
      res.Contents?.map((obj) => ({
        id: obj.Key!,
        key: obj.Key!,
        bucket,
        filename: obj.Key?.split('/').pop(),
        size: obj.Size || 0,
        mimeType: 'application/octet-stream',
        url: `${minioEndpoint}/${bucket}/${obj.Key}`,
        metadata: {},
        encrypted: false,
        checksum: obj.ETag || '',
        uploadedBy: '',
        createdAt: (obj.LastModified && obj.LastModified.toISOString()) || '',
      })) || [];

    return NextResponse.json(objects);
  } catch (error) {
    console.error('Storage list error:', error);
    return NextResponse.json(
      { error: 'Failed to list objects', details: String(error) },
      { status: 500 }
    );
  }
}