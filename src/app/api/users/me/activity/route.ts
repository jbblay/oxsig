/**
 * User Activity API
 * GET /api/users/me/activity - Get user's recent activity
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth/middleware';
import { getPool } from '@/lib/db/pool';

export async function GET(request: NextRequest) {
  return requireAuth(request, async (req, user) => {
    try {
      const { searchParams } = new URL(req.url);
      const limit = parseInt(searchParams.get('limit') || '10');
      const offset = parseInt(searchParams.get('offset') || '0');

      // Get recent activity from various tables
      const activities: any[] = [];

      // Recent signatures
      const signaturesResult = await getPool().query(
        `SELECT 
          'signature' as type,
          s.id,
          s.created_at,
          d.filename,
          'Signed document' as action
         FROM signatures s
         JOIN documents d ON s.document_id = d.id
         WHERE s.signer_id = $1
         ORDER BY s.created_at DESC
         LIMIT 5`,
        [user.id]
      );
      
      signaturesResult.rows.forEach((row: any) => {
        activities.push({
          id: `sig_${row.id}`,
          type: 'SIGNATURE_CREATE',
          action: 'Signed document',
          file: row.filename,
          timestamp: row.created_at,
          icon: 'FileSignature'
        });
      });

      // Recent collaborations joined
      const collabResult = await getPool().query(
        `SELECT 
          'collaboration' as type,
          c.id,
          c.created_at,
          c.name,
          'Joined collaboration' as action
         FROM collaboration_members cm
         JOIN collaborations c ON cm.collaboration_id = c.id
         WHERE cm.user_id = $1
         ORDER BY cm.created_at DESC
         LIMIT 5`,
        [user.id]
      );
      
      collabResult.rows.forEach((row: any) => {
        activities.push({
          id: `collab_${row.id}`,
          type: 'COLLABORATION_JOIN',
          action: 'Joined collaboration',
          detail: row.name,
          timestamp: row.created_at,
          icon: 'Users'
        });
      });

      // Recent documents uploaded
      const documentsResult = await getPool().query(
        `SELECT 
          'document' as type,
          id,
          created_at,
          filename,
          'Uploaded document' as action
         FROM documents
         WHERE owner_id = $1
         ORDER BY created_at DESC
         LIMIT 5`,
        [user.id]
      );
      
      documentsResult.rows.forEach((row: any) => {
        activities.push({
          id: `doc_${row.id}`,
          type: 'DOCUMENT_UPLOAD',
          action: 'Uploaded document',
          file: row.filename,
          timestamp: row.created_at,
          icon: 'Upload'
        });
      });

      // Sort all activities by timestamp
      activities.sort((a, b) => 
        new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
      );

      // Apply pagination
      const paginatedActivities = activities.slice(offset, offset + limit);

      // Format timestamps as relative time
      const formattedActivities = paginatedActivities.map(activity => ({
        ...activity,
        time: formatRelativeTime(new Date(activity.timestamp))
      }));

      return NextResponse.json({
        activities: formattedActivities,
        total: activities.length,
        limit,
        offset
      });
    } catch (error) {
      console.error('Failed to get user activity:', error);
      return NextResponse.json(
        { error: 'Failed to retrieve activity' },
        { status: 500 }
      );
    }
  });
}

function formatRelativeTime(date: Date): string {
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins} min${diffMins > 1 ? 's' : ''} ago`;
  if (diffHours < 24) return `${diffHours} hour${diffHours > 1 ? 's' : ''} ago`;
  if (diffDays < 7) return `${diffDays} day${diffDays > 1 ? 's' : ''} ago`;
  return date.toLocaleDateString();
}
