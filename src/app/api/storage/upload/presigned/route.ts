/**
 * File Upload API Route - Generate presigned upload URLs and handle completion
 * POST /api/storage/upload/presigned - Generate presigned URL for direct MinIO upload
 * POST /api/storage/upload/complete - Complete upload and record metadata
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth/middleware';
import { sha256 } from '@noble/hashes/sha256';
import { bytesToHex } from '@noble/hashes/utils';
import { randomBytes } from '@noble/hashes/utils';

/**
 * POST /api/storage/upload/presigned
 * Generate presigned URL for direct MinIO upload
 */
export async function POST(request: NextRequest) {
  return requireAuth(request, async (req, user) => {
    try {
      const body = await req.json();
      const { filename, fileSize, mimeType, isEncrypted = false } = body;

      // Validate input
      if (!filename || !fileSize) {
        return NextResponse.json(
          { error: 'Filename and fileSize are required' },
          { status: 400 }
        );
      }

      if (fileSize <= 0 || fileSize > 5 * 1024 * 1024 * 1024) { // 5GB limit
        return NextResponse.json(
          { error: 'File size must be between 1 byte and 5GB' },
          { status: 400 }
        );
      }

      // Generate unique object key
      const timestamp = Date.now();
      const randomSuffix = bytesToHex(randomBytes(8));
      const sanitizedFilename = filename.replace(/[^a-zA-Z0-9.-]/g, '_');
      const objectKey = `${user.id}/${timestamp}_${randomSuffix}_${sanitizedFilename}`;

      // Generate presigned upload URL
      const bucketName = process.env.MINIO_BUCKET || 'oxsig-files';
      const presignedUrl = await generatePresignedUploadUrl(bucketName, objectKey, mimeType);

      // Return upload info
      return NextResponse.json({
        uploadUrl: presignedUrl,
        objectKey,
        bucketName,
        expiresIn: 3600, // 1 hour
        maxFileSize: 5 * 1024 * 1024 * 1024,
        uploadId: `${timestamp}_${randomSuffix}` // For tracking
      });

    } catch (error) {
      console.error('Failed to generate presigned upload URL:', error);
      return NextResponse.json(
        { error: 'Failed to generate upload URL' },
        { status: 500 }
      );
    }
  });
}

/**
 * Generate presigned upload URL for MinIO
 */
async function generatePresignedUploadUrl(
  bucketName: string, 
  objectKey: string, 
  mimeType?: string
): Promise<string> {
  try {
    // In production, this would use MinIO client SDK
    // For development, return a mock URL
    const minioEndpoint = process.env.MINIO_ENDPOINT || 'http://localhost:9000';
    
    // Mock presigned URL with required parameters
    const url = new URL(`${minioEndpoint}/${bucketName}/${objectKey}`);
    url.searchParams.set('X-Amz-Algorithm', 'AWS4-HMAC-SHA256');
    url.searchParams.set('X-Amz-Credential', 'minioadmin/20240101/us-east-1/s3/aws4_request');
    url.searchParams.set('X-Amz-Date', new Date().toISOString().replace(/[:-]|\.\d{3}/g, ''));
    url.searchParams.set('X-Amz-Expires', '3600');
    url.searchParams.set('X-Amz-SignedHeaders', 'host');
    
    if (mimeType) {
      url.searchParams.set('Content-Type', mimeType);
    }
    
    // In production, add actual signature
    url.searchParams.set('X-Amz-Signature', 'mock-signature-' + Date.now());
    
    return url.toString();
  } catch (error) {
    console.error('Failed to generate presigned upload URL:', error);
    throw new Error('Failed to generate upload URL');
  }
}