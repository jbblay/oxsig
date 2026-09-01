import 'server-only';

import { getPool } from '@/lib/db/pool';
import type { StoryboardPermission, StoryboardServerSession } from './types';

export type StoryboardAccess = StoryboardServerSession & {
  events: StoryboardServerSession['events'];
};

export function mapStoryboardRow(row: Record<string, any>): StoryboardAccess {
  const permission: StoryboardPermission =
    row.owner_id === row.request_user_id ? 'owner' : row.share_permission;

  return {
    id: row.id,
    title: row.title,
    description: row.description,
    status: row.status,
    durationMs: row.duration_ms,
    events: row.events,
    hasAudio: row.has_audio,
    audioMimeType: row.audio_mime_type,
    audioSize: row.audio_size,
    ownerId: row.owner_id,
    ownerName: row.owner_name || row.owner_email || 'OXSIG user',
    ownerEmail: row.owner_email,
    permission,
    version: row.version,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function getStoryboardAccess(
  sessionId: string,
  userId: string
): Promise<StoryboardAccess | null> {
  const result = await getPool().query(
    `SELECT
       s.id, s.owner_id, s.title, s.description, s.status, s.duration_ms,
       s.events, s.audio_data IS NOT NULL AS has_audio, s.audio_mime_type,
       s.audio_size, s.version, s.created_at, s.updated_at,
       owner.display_name AS owner_name, owner.email AS owner_email,
       share.permission AS share_permission, $2::uuid AS request_user_id
     FROM storyboard_sessions s
     JOIN users owner ON owner.id = s.owner_id
     LEFT JOIN storyboard_shares share
       ON share.session_id = s.id
      AND share.user_id = $2
      AND share.revoked_at IS NULL
      AND (share.expires_at IS NULL OR share.expires_at > NOW())
     WHERE s.id = $1
       AND s.deleted_at IS NULL
       AND (s.owner_id = $2 OR share.user_id = $2)
     LIMIT 1`,
    [sessionId, userId]
  );

  return result.rows[0] ? mapStoryboardRow(result.rows[0]) : null;
}

export async function listStoryboardsForUser(userId: string): Promise<StoryboardServerSession[]> {
  const result = await getPool().query(
    `SELECT
       s.id, s.owner_id, s.title, s.description, s.status, s.duration_ms,
       NULL::jsonb AS events, s.audio_data IS NOT NULL AS has_audio,
       s.audio_mime_type, s.audio_size, s.version, s.created_at, s.updated_at,
       owner.display_name AS owner_name, owner.email AS owner_email,
       share.permission AS share_permission, $1::uuid AS request_user_id
     FROM storyboard_sessions s
     JOIN users owner ON owner.id = s.owner_id
     LEFT JOIN storyboard_shares share
       ON share.session_id = s.id
      AND share.user_id = $1
      AND share.revoked_at IS NULL
      AND (share.expires_at IS NULL OR share.expires_at > NOW())
     WHERE s.deleted_at IS NULL
       AND (s.owner_id = $1 OR share.user_id = $1)
     ORDER BY s.updated_at DESC
     LIMIT 100`,
    [userId]
  );

  return result.rows.map(mapStoryboardRow);
}
