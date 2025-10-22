import { NextRequest, NextResponse } from 'next/server';
import { S3Client, CopyObjectCommand } from '@aws-sdk/client-s3';

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
    const { sourceKey, destKey, sourceBucket, destBucket } = await request.json();
    const bucketFrom = sourceBucket || process.env.MINIO_BUCKET || 'oxsig-documents';
    const bucketTo = destBucket || process.env.MINIO_BUCKET || 'oxsig-documents';

    if (!sourceKey || !destKey) {
      return NextResponse.json({ error: 'Missing sourceKey or destKey' }, { status: 400 });
    }

    await getS3Client().send(
      new CopyObjectCommand({
        Bucket: bucketTo,
        CopySource: `/${bucketFrom}/${sourceKey}`,
        Key: destKey,
      })
    );

    const minioEndpoint = process.env.MINIO_ENDPOINT || 'http://localhost:9000';
    return NextResponse.json({
      id: destKey,
      key: destKey,
      bucket: bucketTo,
      filename: destKey.split('/').pop(),
      size: 0,
      mimeType: 'application/octet-stream',
      url: `${minioEndpoint}/${bucketTo}/${destKey}`,
      metadata: {},
      encrypted: false,
      checksum: '',
      uploadedBy: '',
      createdAt: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Copy error:', error);
    return NextResponse.json({ error: 'Failed to copy object' }, { status: 500 });
  }
}