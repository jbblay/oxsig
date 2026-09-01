/**
 * Health API - GET /api/health
 * Checks service connectivity and reports authentication readiness without
 * exposing secrets.
 */

import { NextRequest, NextResponse } from 'next/server';
import { S3Client, ListBucketsCommand } from '@aws-sdk/client-s3';
import { checkConnection, getPool, isDatabaseConfigured } from '@/lib/db/pool';

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

async function checkAuthSchema(): Promise<boolean> {
  try {
    const result = await getPool().query(`
      SELECT
        to_regclass('public.users') IS NOT NULL AS users_table,
        to_regclass('public.sessions') IS NOT NULL AS sessions_table,
        EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_schema = 'public' AND table_name = 'users' AND column_name = 'password_hash'
        ) AS password_hash_column,
        EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_schema = 'public' AND table_name = 'users' AND column_name = 'role'
        ) AS role_column,
        EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_schema = 'public' AND table_name = 'users' AND column_name = 'last_seen_at'
        ) AS last_seen_column
    `);

    const schema = result.rows[0];
    return Boolean(
      schema?.users_table &&
      schema?.sessions_table &&
      schema?.password_hash_column &&
      schema?.role_column &&
      schema?.last_seen_column
    );
  } catch (error) {
    console.error('Authentication schema check failed:', error);
    return false;
  }
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
    authSchemaReady: false,
    authReady: false,
    timestamp: new Date().toISOString(),
  };

  if (databaseConfigured) {
    status.postgres = await checkConnection();
    if (status.postgres) {
      status.authSchemaReady = await checkAuthSchema();
    }
  }

  status.authReady = status.postgres && status.jwtConfigured && status.authSchemaReady;

  try {
    await getS3Client().send(new ListBucketsCommand({}));
    status.minio = true;
  } catch {
    status.minio = false;
  }

  try {
    const meiliUrl = process.env.MEILISEARCH_URL || 'http://localhost:7700';
    const response = await fetch(`${meiliUrl}/health`, { method: 'GET' });
    status.meilisearch = response.ok;
  } catch {
    status.meilisearch = false;
  }

  return NextResponse.json(status);
}
