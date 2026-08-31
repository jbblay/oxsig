import { HeadBucketCommand } from '@aws-sdk/client-s3';
import { NextResponse } from 'next/server';
import { getPool } from '@/lib/db/pool';
import { getDocumentBucket, getS3Client } from '@/lib/storage/s3-server';

export async function GET() {
  const status = {
    postgres: false,
    minio: false,
    timestamp: new Date().toISOString(),
  };

  try {
    const result = await getPool().query('SELECT 1 AS ok');
    status.postgres = result.rows[0]?.ok === 1;
  } catch {
    status.postgres = false;
  }

  try {
    await getS3Client().send(new HeadBucketCommand({ Bucket: getDocumentBucket() }));
    status.minio = true;
  } catch {
    status.minio = false;
  }

  const healthy = status.postgres && status.minio;
  return NextResponse.json(status, { status: healthy ? 200 : 503 });
}
