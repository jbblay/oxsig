/**
 * Storage Upload API Route - POST /api/storage/upload
 */

import { NextRequest, NextResponse } from 'next/server';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { v4 as uuidv4 } from 'uuid';

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
    // @ts-ignore - formData exists on NextRequest at runtime
    const formData = await request.formData();
    const file = formData.get('file') as File;
    const optionsStr = formData.get('options') as string;

    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 });
    }

    const options = optionsStr ? JSON.parse(optionsStr) : {};
    const bucket = options.bucket || process.env.MINIO_BUCKET || 'oxsig-documents';
    const filename = options.filename || file.name;
    const fileExtension = filename.split('.').pop();
    const uniqueFilename = `${uuidv4()}.${fileExtension}`;
    const key = `uploads/${uniqueFilename}`;

    // Upload to MinIO
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    await getS3Client().send(
      new PutObjectCommand({
        Bucket: bucket,
        Key: key,
        Body: buffer,
        ContentType: options.contentType || file.type,
        Metadata: {
          originalName: filename,
          uploadedBy: 'temp-user-id',
          uploadedAt: new Date().toISOString(),
          ...options.metadata,
        },
      })
    );

    const minioEndpoint = process.env.MINIO_ENDPOINT || 'http://localhost:9000';
    const url = `${minioEndpoint}/${bucket}/${key}`;

    const storageObject = {
      id: uuidv4(),
      key,
      bucket,
      filename,
      size: file.size,
      mimeType: file.type,
      url,
      publicUrl: options.publicRead ? url : undefined,
      metadata: options.metadata || {},
      encrypted: options.encrypted || false,
      checksum: '', // TODO: Calculate checksum
      uploadedBy: 'temp-user-id',
      createdAt: new Date().toISOString(),
    };

    return NextResponse.json(storageObject, { status: 201 });
  } catch (error) {
    console.error('Error uploading file:', error);
    return NextResponse.json(
      { error: 'Failed to upload file', details: String(error) },
      { status: 500 }
    );
  }
}
