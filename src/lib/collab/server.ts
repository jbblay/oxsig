import 'server-only';

import type { Pool } from 'pg';

export type CollaborationAccess = {
  id: string;
  name: string;
  ownerId: string;
  isOwner: boolean;
  role: string;
};

export async function getCollaborationAccess(
  pool: Pool,
  collaborationId: string,
  userId: string
): Promise<CollaborationAccess | null> {
  const result = await pool.query(
    `SELECT c.id,
            c.name,
            c.owner_id,
            CASE WHEN c.owner_id = $1 THEN true ELSE false END AS is_owner,
            CASE WHEN c.owner_id = $1 THEN 'owner' ELSE COALESCE(cm.role, 'member') END AS member_role
     FROM collaborations c
     LEFT JOIN collaboration_members cm
       ON cm.collaboration_id = c.id
      AND cm.user_id = $1
      AND cm.status = 'active'
     WHERE c.id = $2
       AND c.status = 'active'
       AND (c.owner_id = $1 OR cm.user_id = $1)
     LIMIT 1`,
    [userId, collaborationId]
  );

  const row = result.rows[0];
  if (!row) return null;

  return {
    id: row.id,
    name: row.name,
    ownerId: row.owner_id,
    isOwner: Boolean(row.is_owner),
    role: row.member_role || 'member',
  };
}

export function collaborationObjectPrefix(collaborationId: string): string {
  return `collaborations/${collaborationId}/`;
}

export function assertCollaborationObjectKey(collaborationId: string, key: string): string {
  const prefix = collaborationObjectPrefix(collaborationId);
  if (!key.startsWith(prefix) || key.includes('..') || /[\r\n\0]/.test(key)) {
    throw new Error('INVALID_COLLABORATION_OBJECT_KEY');
  }
  return key;
}
