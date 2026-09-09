import 'server-only';

import { DeleteObjectsCommand, ListObjectsV2Command } from '@aws-sdk/client-s3';
import { getStorageBucket, getStorageClient } from './server';

export async function deleteStoragePrefix(prefix: string): Promise<number> {
  const client = getStorageClient();
  const bucket = getStorageBucket();
  let continuationToken: string | undefined;
  let deleted = 0;

  do {
    const page = await client.send(new ListObjectsV2Command({
      Bucket: bucket,
      Prefix: prefix,
      ContinuationToken: continuationToken,
    }));
    const objects = (page.Contents || [])
      .map((item) => item.Key)
      .filter((key): key is string => Boolean(key))
      .map((Key) => ({ Key }));

    if (objects.length > 0) {
      const result = await client.send(new DeleteObjectsCommand({
        Bucket: bucket,
        Delete: { Objects: objects, Quiet: true },
      }));
      if (result.Errors?.length) throw new Error('STORAGE_PREFIX_CLEANUP_FAILED');
      deleted += objects.length;
    }

    continuationToken = page.IsTruncated ? page.NextContinuationToken : undefined;
  } while (continuationToken);

  return deleted;
}

export async function deleteStorageKeys(keys: string[]): Promise<number> {
  const unique = [...new Set(keys.map((key) => key.trim()).filter(Boolean))];
  if (unique.length === 0) return 0;
  const client = getStorageClient();
  const bucket = getStorageBucket();
  let deleted = 0;

  for (let offset = 0; offset < unique.length; offset += 1000) {
    const chunk = unique.slice(offset, offset + 1000);
    const result = await client.send(new DeleteObjectsCommand({
      Bucket: bucket,
      Delete: { Objects: chunk.map((Key) => ({ Key })), Quiet: true },
    }));
    if (result.Errors?.length) throw new Error('STORAGE_KEY_CLEANUP_FAILED');
    deleted += chunk.length;
  }

  return deleted;
}
