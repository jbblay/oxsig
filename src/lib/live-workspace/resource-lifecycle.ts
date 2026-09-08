import 'server-only';

import type { Pool, PoolClient } from 'pg';
import type { LiveWorkspaceResourceType } from './server';

export async function detachOwnerResourceFromLiveWorkspaces(
  queryable: Pool | PoolClient,
  ownerId: string,
  resourceType: LiveWorkspaceResourceType,
  resourceId: string
): Promise<number> {
  const result = await queryable.query(
    `UPDATE live_workspace_resources
        SET status = 'detached',
            detached_at = COALESCE(detached_at, NOW()),
            updated_at = NOW()
      WHERE resource_owner_id = $1
        AND resource_type = $2
        AND resource_id = $3
        AND status = 'attached'`,
    [ownerId, resourceType, resourceId]
  );
  return result.rowCount || 0;
}
