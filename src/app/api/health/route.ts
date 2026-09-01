/**
 * Health API - GET /api/health
 * Checks connectivity for Postgres, MinIO and Meilisearch and reports whether
 * the production authentication prerequisites are configured.
 */

import { NextRequest, NextResponse } from 'next/server';
import { S3Client, ListBucketsCommand } from '@aws-sdk/client-s3';
import { checkConnection, isDatabaseConfigured } from '@/lib/db/pool';

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

export async function GET(_request: NextRequest) {
  const databaseConfigured = isDatabaseConfigured();
  const jwtConfigured = Boolean(process.env.JWT_PRIVATE_KEY && process.env.JWT_PUBLIC_KEY);

  const status = {
    postgres: false,
    minio: false,
    meilisearch: false,
    databaseConfigured,
    jwtConfigured,
    authReady: false,
    timestamp: new Date().toISOString(),
  };

  if (databaseConfigured) {
    status.postgres = await checkConnection();
  }

  status.authReady = status.postgres && jwtConfigured;

  try {
    await getS3Client().send(new ListBucketsCommand({}));
    status.minio = true;
  } catch {
    status.minio = false;
  }

  try {
    const meiliUrl = process.env.MEILISEARCH_URL || 'http://localhost:7700';
    const r = await fetch(`${meiliUrl}/health`, { method: 'GET' });
    status.meilisearch = r.ok;
  } catch {
    status.meilisearch = false;
  }

  return NextResponse.json(status);
}
