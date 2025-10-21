/**
 * MinIO/S3 Storage Integration
 * File upload and download utilities
 */

import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

// Initialize S3 client
const s3Client = new S3Client({
  region: process.env.MINIO_REGION || 'us-east-1',
  endpoint: process.env.MINIO_ENDPOINT || 'http://localhost:9000',
  credentials: {
    accessKeyId: process.env.MINIO_ACCESS_KEY || 'minioadmin',
    secretAccessKey: process.env.MINIO_SECRET_KEY || 'minioadmin',
  },
  forcePathStyle: true, // Required for MinIO
});

const BUCKET_NAME = process.env.MINIO_BUCKET || 'oxsig-documents';

export interface UploadResult {
  key: string;
  url: string;
  bucket: string;
  size: number;
  contentType: string;
}

/**
 * Upload file to S3/MinIO
 */
export async function uploadFile(
  file: Buffer,
  fileName: string,
  contentType: string,
  metadata?: Record<string, string>
): Promise<UploadResult> {
  const key = `${Date.now()}-${fileName}`;

  const command = new PutObjectCommand({
    Bucket: BUCKET_NAME,
    Key: key,
    Body: file,
    ContentType: contentType,
    Metadata: metadata,
  });

  await s3Client.send(command);

  // Generate public URL (or signed URL if bucket is private)
  const url = `${process.env.MINIO_ENDPOINT}/${BUCKET_NAME}/${key}`;

  return {
    key,
    url,
    bucket: BUCKET_NAME,
    size: file.length,
    contentType,
  };
}

/**
 * Upload file with custom key (useful for predictable paths)
 */
export async function uploadFileWithKey(
  file: Buffer,
  key: string,
  contentType: string,
  metadata?: Record<string, string>
): Promise<UploadResult> {
  const command = new PutObjectCommand({
    Bucket: BUCKET_NAME,
    Key: key,
    Body: file,
    ContentType: contentType,
    Metadata: metadata,
  });

  await s3Client.send(command);

  const url = `${process.env.MINIO_ENDPOINT}/${BUCKET_NAME}/${key}`;

  return {
    key,
    url,
    bucket: BUCKET_NAME,
    size: file.length,
    contentType,
  };
}

/**
 * Generate a presigned download URL (expires in 1 hour by default)
 */
export async function getDownloadUrl(key: string, expiresIn: number = 3600): Promise<string> {
  const command = new GetObjectCommand({
    Bucket: BUCKET_NAME,
    Key: key,
  });

  return await getSignedUrl(s3Client, command, { expiresIn });
}

/**
 * Delete a file from S3/MinIO
 */
export async function deleteFile(key: string): Promise<void> {
  const command = new DeleteObjectCommand({
    Bucket: BUCKET_NAME,
    Key: key,
  });

  await s3Client.send(command);
}

/**
 * Upload file from base64 data
 */
export async function uploadBase64(
  base64Data: string,
  fileName: string,
  contentType: string,
  metadata?: Record<string, string>
): Promise<UploadResult> {
  // Remove data URL prefix if present
  const base64 = base64Data.replace(/^data:.*?;base64,/, '');
  const buffer = Buffer.from(base64, 'base64');

  return uploadFile(buffer, fileName, contentType, metadata);
}

/**
 * Check if file exists
 */
export async function fileExists(key: string): Promise<boolean> {
  try {
    const command = new GetObjectCommand({
      Bucket: BUCKET_NAME,
      Key: key,
    });
    await s3Client.send(command);
    return true;
  } catch (error) {
    return false;
  }
}

/**
 * Get file metadata
 */
export async function getFileMetadata(key: string): Promise<Record<string, string> | null> {
  try {
    const command = new GetObjectCommand({
      Bucket: BUCKET_NAME,
      Key: key,
    });
    const response = await s3Client.send(command);
    return response.Metadata || null;
  } catch (error) {
    return null;
  }
}
