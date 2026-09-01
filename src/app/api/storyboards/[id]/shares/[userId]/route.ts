import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth/middleware';
import { getPool } from '@/lib/db/pool';
import { logAudit, getRequestMetadata, AUDIT_ACTIONS } from '@/lib/audit/logger';
import { validateCsrfToken } from '@/lib/security/csrf';
import { canManageStoryboard } from '@/lib/storyboards/access';
import { getStoryboardAccess } from '@/lib/storyboards/server';
import { storyboardIdSchema } from '@/lib/storyboards/validation';

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; userId: string }> }
) {
  return requireAuth(request, async (req, user) => {
    if (!(await validateCsrfToken(req))) {
      return NextResponse.json({ error: 'Invalid or missing CSRF token' }, { status: 403 });
    }
    const { id, userId } = await params;
    if (!storyboardIdSchema.safeParse(id).success || !storyboardIdSchema.safeParse(userId).success) {
      return NextResponse.json({ error: 'Invalid resource ID' }, { status: 400 });
    }
    try {
      const access = await getStoryboardAccess(id, user.id);
      if (!access) return NextResponse.json({ error: 'Storyboard not found' }, { status: 404 });
      if (!canManageStoryboard(access.permission)) {
        return NextResponse.json({ error: 'Only the owner can revoke access' }, { status: 403 });
      }
      const result = await getPool().query(
        `UPDATE storyboard_shares SET revoked_at = NOW(), updated_at = NOW()
         WHERE session_id = $1 AND user_id = $2 AND revoked_at IS NULL
         RETURNING id`,
        [id, userId]
      );
      if (!result.rowCount) return NextResponse.json({ error: 'Active share not found' }, { status: 404 });
      await logAudit({
        userId: user.id,
        action: AUDIT_ACTIONS.STORYBOARD_REVOKE,
        resourceType: 'storyboard',
        resourceId: id,
        ...getRequestMetadata(req),
        metadata: { targetUserId: userId },
      });
      return NextResponse.json({ success: true });
    } catch (error) {
      console.error('Failed to revoke storyboard access:', error);
      return NextResponse.json({ error: 'Failed to revoke storyboard access' }, { status: 500 });
    }
  });
}
