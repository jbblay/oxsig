import 'server-only';

import { getPool } from '@/lib/db/pool';
import type { StoryboardComment } from './types';

export function mapStoryboardCommentRow(row: Record<string, any>): StoryboardComment {
  return {
    id: row.id,
    sessionId: row.session_id,
    authorId: row.author_id,
    authorName: row.author_name || 'OXSIG user',
    authorAvatarUrl: row.author_avatar_url || null,
    point: { x: Number(row.point_x), y: Number(row.point_y) },
    body: row.body,
    resolvedAt: row.resolved_at || null,
    resolvedBy: row.resolved_by || null,
    resolvedByName: row.resolved_by_name || null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

const COMMENT_SELECT = `
  SELECT comment.id, comment.session_id, comment.author_id,
         comment.point_x, comment.point_y, comment.body,
         comment.resolved_at, comment.resolved_by,
         comment.created_at, comment.updated_at,
         COALESCE(author.display_name, split_part(author.email,'@',1), 'OXSIG user') AS author_name,
         author.avatar_url AS author_avatar_url,
         CASE WHEN resolver.id IS NULL THEN NULL
              ELSE COALESCE(resolver.display_name, split_part(resolver.email,'@',1), 'OXSIG user') END AS resolved_by_name
    FROM storyboard_comments comment
    JOIN users author ON author.id = comment.author_id
    LEFT JOIN users resolver ON resolver.id = comment.resolved_by`;

export async function listStoryboardComments(sessionId: string): Promise<StoryboardComment[]> {
  const result = await getPool().query(
    `${COMMENT_SELECT}
      WHERE comment.session_id = $1
        AND comment.deleted_at IS NULL
      ORDER BY comment.resolved_at NULLS FIRST, comment.created_at ASC`,
    [sessionId]
  );
  return result.rows.map(mapStoryboardCommentRow);
}

export async function getStoryboardComment(
  sessionId: string,
  commentId: string
): Promise<StoryboardComment | null> {
  const result = await getPool().query(
    `${COMMENT_SELECT}
      WHERE comment.session_id = $1
        AND comment.id = $2
        AND comment.deleted_at IS NULL
      LIMIT 1`,
    [sessionId, commentId]
  );
  return result.rows[0] ? mapStoryboardCommentRow(result.rows[0]) : null;
}
