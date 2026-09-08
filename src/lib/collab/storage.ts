import 'server-only';

import { DeleteObjectsCommand, ListObjectsV2Command } from '@aws-sdk/client-s3';
import { collaborationObjectPrefix } from './server';
import { getStorageBucket, getStorageClient } from '@/lib/storage/server';

export async function deleteCollaborationObjects(collaborationId: string): Promise<number> {
  const client = getStorageClient();
  const bucket = getStorageBucket();
  const prefix = collaborationObjectPrefix(collaborationId);
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
      if (result.Errors?.length) {
        throw new Error('COLLABORATION_STORAGE_CLEANUP_FAILED');
      }
      deleted += objects.length;
    }

    continuationToken = page.IsTruncated ? page.NextContinuationToken : undefined;
  } while (continuationToken);

  return deleted;
}
