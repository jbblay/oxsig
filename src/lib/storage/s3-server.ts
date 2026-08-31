import {
  CreateBucketCommand,
  HeadBucketCommand,
  S3Client,
} from '@aws-sdk/client-s3';

let client: S3Client | null = null;
let bucketReady: Promise<string> | null = null;

export function getS3Client(): S3Client {
  if (!client) {
    if (process.env.NODE_ENV === 'production') {
      const required = [
        process.env.MINIO_ENDPOINT,
        process.env.MINIO_ACCESS_KEY,
        process.env.MINIO_SECRET_KEY,
        process.env.MINIO_BUCKET,
      ];
      let localStorage = false;
      try {
        localStorage = ['localhost', '127.0.0.1', 'minio'].includes(
          new URL(process.env.MINIO_ENDPOINT || '').hostname,
        );
      } catch {
        localStorage = false;
      }
      if (
        required.some((value) => !value) ||
        (process.env.MINIO_SECRET_KEY === 'minioadmin' && !localStorage)
      ) {
        throw new Error('Production object storage configuration is missing or uses development credentials');
      }
    }
    client = new S3Client({
      endpoint: process.env.MINIO_ENDPOINT || 'http://localhost:9000',
      region: process.env.MINIO_REGION || 'us-east-1',
      credentials: {
        accessKeyId: process.env.MINIO_ACCESS_KEY || 'minioadmin',
        secretAccessKey: process.env.MINIO_SECRET_KEY || 'minioadmin',
      },
      forcePathStyle: true,
    });
  }
  return client;
}

export function getDocumentBucket(): string {
  return process.env.MINIO_BUCKET || 'oxsig-documents';
}

export async function ensureDocumentBucket(): Promise<string> {
  if (!bucketReady) {
    bucketReady = (async () => {
      const bucket = getDocumentBucket();
      try {
        await getS3Client().send(new HeadBucketCommand({ Bucket: bucket }));
      } catch (error) {
        const status = (error as { $metadata?: { httpStatusCode?: number } }).$metadata?.httpStatusCode;
        if (status !== 404) throw error;
        await getS3Client().send(new CreateBucketCommand({ Bucket: bucket }));
      }
      return bucket;
    })().catch((error) => {
      bucketReady = null;
      throw error;
    });
  }
  return bucketReady;
}
