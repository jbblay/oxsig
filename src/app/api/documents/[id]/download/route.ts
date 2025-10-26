/**
 * Document Download API Route - GET /api/documents/[id]/download
 * Download files from MinIO
 */

import { NextRequest, NextResponse } from 'next/server';
import { Pool } from 'pg';
import { S3Client, GetObjectCommand } from '@aws-sdk/client-s3';

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
      max: 20,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 2000,
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

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    // Get document metadata
    const query = `
      SELECT file_url, mime_type, title
      FROM documents
      WHERE id = $1 AND deleted_at IS NULL
    `;

    const result = await getPool().query(query, [id]);

    if (result.rows.length === 0) {
      return NextResponse.json({ error: 'Document not found' }, { status: 404 });
    }

    const { file_url, mime_type, title } = result.rows[0];

    if (!file_url) {
      return NextResponse.json({ error: 'Document has no file attached' }, { status: 400 });
    }

    // Parse S3 URL
    const url = new URL(file_url);
    const pathParts = url.pathname.split('/');
    const bucket = pathParts[1];
    const key = pathParts.slice(2).join('/');

    // Download from MinIO
    const command = new GetObjectCommand({
      Bucket: bucket,
      Key: key,
    });

    const response = await getS3Client().send(command);

    if (!response.Body) {
      return NextResponse.json({ error: 'File not found in storage' }, { status: 404 });
    }

    // Convert stream to buffer
    const chunks: Uint8Array[] = [];
    for await (const chunk of response.Body as any) {
      chunks.push(chunk);
    }
    const buffer = Buffer.concat(chunks);

    // Return file with proper headers
    return new NextResponse(buffer, {
      headers: {
        'Content-Type': mime_type || 'application/octet-stream',
        'Content-Disposition': `attachment; filename="${title}"`,
        'Content-Length': buffer.length.toString(),
      },
    });
  } catch (error) {
    console.error('Error downloading document:', error);
    return NextResponse.json(
      { error: 'Failed to download document', details: String(error) },
      { status: 500 }
    );
  }
}
