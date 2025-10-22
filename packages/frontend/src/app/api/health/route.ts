/**
 * Health API - GET /api/health
 * Checks connectivity for Postgres, MinIO and Meilisearch.
 */

import { NextRequest, NextResponse } from 'next/server';
import { Pool } from 'pg';
import { S3Client, ListBucketsCommand } from '@aws-sdk/client-s3';

let pool: Pool | null = null;
let s3Client: S3Client | null = null;

function getPool() {
  if (!pool) {
    pool = new Pool({
      host: process.env.POSTGRES_HOST || 'localhost',
      port: parseInt(process.env.POSTGRES_PORT || '5432'),
      database: process.env.POSTGRES_DB || 'oxsig',
      user: process.env.POSTGRES_USER || 'oxsig',
      password: process.env.POSTGRES_PASSWORD || 'oxsig_secure_password',
      max: 5,
    });
  }
  return pool;
}

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
  const status = {
    postgres: false,
    minio: false,
    meilisearch: false,
    timestamp: new Date().toISOString(),
  };

  try {
    const res = await getPool().query('SELECT 1 AS ok');
    status.postgres = res.rows?.[0]?.ok === 1;
  } catch {
    status.postgres = false;
  }

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