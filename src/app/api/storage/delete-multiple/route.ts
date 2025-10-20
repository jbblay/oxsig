/**
 * Storage Delete Multiple API - DELETE /api/storage/delete-multiple
 */

import { NextRequest, NextResponse } from 'next/server';
import { S3Client, DeleteObjectsCommand } from '@aws-sdk/client-s3';

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
    const body = await request.json();
    const keys: string[] = body?.keys || [];
    const bucket = body?.bucket || process.env.MINIO_BUCKET || 'oxsig-documents';

    if (!Array.isArray(keys) || keys.length === 0) {
      return NextResponse.json({ error: 'No keys provided' }, { status: 400 });
    }

    await getS3Client().send(
      new DeleteObjectsCommand({
        Bucket: bucket,
        Delete: { Objects: keys.map((k) => ({ Key: k })) },
      })
    );

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Storage delete-multiple error:', error);
    return NextResponse.json(
      { error: 'Failed to delete objects', details: String(error) },
      { status: 500 }
    );
  }
}