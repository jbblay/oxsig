/**
 * Document Upload API Route - POST /api/documents/upload
 * Upload files to MinIO and create document records
 */

import { NextRequest, NextResponse } from 'next/server';
import { Pool } from 'pg';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { v4 as uuidv4 } from 'uuid';

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
      forcePathStyle: true, // Required for MinIO
    });
  }
  return s3Client;
}

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get('file') as File;
    const metadataStr = formData.get('metadata') as string;

    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 });
    }

    const metadata = metadataStr ? JSON.parse(metadataStr) : {};

    // Generate unique filename
    const fileExtension = file.name.split('.').pop();
    const uniqueFilename = `${uuidv4()}.${fileExtension}`;
    const bucket = process.env.MINIO_BUCKET || 'oxsig-documents';
    const key = `documents/${uniqueFilename}`;

    // Upload to MinIO
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    await getS3Client().send(
      new PutObjectCommand({
        Bucket: bucket,
        Key: key,
        Body: buffer,
        ContentType: file.type,
        Metadata: {
          originalName: file.name,
          uploadedAt: new Date().toISOString(),
        },
      })
    );

    // Generate file URL
    const minioEndpoint = process.env.MINIO_ENDPOINT || 'http://localhost:9000';
    const fileUrl = `${minioEndpoint}/${bucket}/${key}`;

    // Create document record
    const ownerId = 'temp-user-id'; // TODO: Get from session
    const title = metadata.title || file.name;
    const contentType = file.type.startsWith('application/pdf') ? 'pdf' : 'html';

    const query = `
      INSERT INTO documents (
        title,
        content,
        content_type,
        owner_id,
        encrypted,
        file_url,
        file_size,
        mime_type,
        metadata,
        tags,
        status,
        version
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, 1)
      RETURNING 
        id,
        title,
        content,
        content_type,
        owner_id,
        encrypted,
        encryption_key,
        file_url,
        file_size,
        mime_type,
        metadata,
        tags,
        status,
        version,
        created_at,
        updated_at
    `;

    const values = [
      title,
      '', // content (empty for files)
      contentType,
      ownerId,
      metadata.encrypted || false,
      fileUrl,
      file.size,
      file.type,
      metadata.metadata || {},
      metadata.tags || [],
      metadata.status || 'draft',
    ];

    const result = await getPool().query(query, values);
    const row = result.rows[0];

    const document = {
      id: row.id,
      title: row.title,
      content: row.content,
      contentType: row.content_type,
      ownerId: row.owner_id,
      encrypted: row.encrypted,
      encryptionKey: row.encryption_key,
      fileUrl: row.file_url,
      fileSize: row.file_size,
      mimeType: row.mime_type,
      metadata: row.metadata,
      tags: row.tags,
      status: row.status,
      version: row.version,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };

    // TODO: Index in Meilisearch
    // TODO: Publish event to NATS

    return NextResponse.json(document, { status: 201 });
  } catch (error) {
    console.error('Error uploading document:', error);
    return NextResponse.json(
      { error: 'Failed to upload document', details: String(error) },
      { status: 500 }
    );
  }
}

export const config = {
  api: {
    bodyParser: false, // Disable body parsing for file uploads
  },
};
