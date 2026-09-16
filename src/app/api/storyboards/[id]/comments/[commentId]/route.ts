import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAuth } from '@/lib/auth/middleware';
import { getPool } from '@/lib/db/pool';
import { publishStoryboardEvent } from '@/lib/realtime/ably';
import { validateCsrfToken } from '@/lib/security/csrf';
import { getStoryboardAccess } from '@/lib/storyboards/server';
import { getStoryboardComment } from '@/lib/storyboards/comments';
import { storyboardIdSchema } from '@/lib/storyboards/validation';

export const runtime = 'nodejs';

type RouteContext = { params: Promise<{ id: string; commentId: string }> };

const commentIdSchema = z.string().uuid();
const updateCommentSchema = z.object({
  body: z.string().trim().min(1).max(2000).optional(),
  resolved: z.boolean().optional(),
}).refine((value) => value.body !== undefined || value.resolved !== undefined, {
  message: 'At least one comment change is required',
});

export async function PATCH(request: NextRequest, { params }: RouteContext) {
  return requireAuth(request, async (req, user) => {
    if (!(await validateCsrfToken(req))) {
      return NextResponse.json({ error: 'Invalid or missing CSRF token' }, { status: 403 });
    }
    const { id, commentId } = await params;
    if (!storyboardIdSchema.safeParse(id).success || !commentIdSchema.safeParse(commentId).success) {
      return NextResponse.json({ error: 'Invalid Board comment' }, { status: 400 });
    }
    const parsed = updateCommentSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid Board comment update', details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    try {
      const access = await getStoryboardAccess(id, user.id);
      if (!access) return NextResponse.json({ error: 'Board not found' }, { status: 404 });
      const existing = await getStoryboardComment(id, commentId);
      if (!existing) return NextResponse.json({ error: 'Board comment not found' }, { status: 404 });

      if (parsed.data.body !== undefined && existing.authorId !== user.id) {
        return NextResponse.json({ error: 'Only the comment author can edit its text' }, { status: 403 });
      }
      if (
        parsed.data.resolved !== undefined &&
        existing.authorId !== user.id &&
        access.permission === 'viewer'
      ) {
        return NextResponse.json({ error: 'Editor permission is required to resolve this comment' }, { status: 403 });
      }

      if (parsed.data.body !== undefined) {
        await getPool().query(
          `UPDATE storyboard_comments
              SET body=$3, updated_at=NOW()
            WHERE session_id=$1 AND id=$2 AND deleted_at IS NULL`,
          [id, commentId, parsed.data.body]
        );
      }
      if (parsed.data.resolved !== undefined) {
        await getPool().query(
          `UPDATE storyboard_comments
              SET resolved_at=CASE WHEN $3::boolean THEN NOW() ELSE NULL END,
                  resolved_by=CASE WHEN $3::boolean THEN $4::uuid ELSE NULL END,
                  updated_at=NOW()
            WHERE session_id=$1 AND id=$2 AND deleted_at IS NULL`,
          [id, commentId, parsed.data.resolved, user.id]
        );
      }

      const comment = await getStoryboardComment(id, commentId);
      if (!comment) return NextResponse.json({ error: 'Board comment not found' }, { status: 404 });
      await publishStoryboardEvent({
        storyboardId: id,
        name: 'comment.updated',
        data: { commentId, actorId: user.id, resolved: Boolean(comment.resolvedAt) },
      });
      return NextResponse.json({ comment });
    } catch (error) {
      console.error('Failed to update Board comment:', error);
      return NextResponse.json({ error: 'Failed to update Board comment' }, { status: 500 });
    }
  });
}

export async function DELETE(request: NextRequest, { params }: RouteContext) {
  return requireAuth(request, async (req, user) => {
    if (!(await validateCsrfToken(req))) {
      return NextResponse.json({ error: 'Invalid or missing CSRF token' }, { status: 403 });
    }
    const { id, commentId } = await params;
    if (!storyboardIdSchema.safeParse(id).success || !commentIdSchema.safeParse(commentId).success) {
      return NextResponse.json({ error: 'Invalid Board comment' }, { status: 400 });
    }

    try {
      const access = await getStoryboardAccess(id, user.id);
      if (!access) return NextResponse.json({ error: 'Board not found' }, { status: 404 });
      const existing = await getStoryboardComment(id, commentId);
      if (!existing) return NextResponse.json({ error: 'Board comment not found' }, { status: 404 });
      if (existing.authorId !== user.id && access.permission !== 'owner') {
        return NextResponse.json({ error: 'Only the comment author or Board owner can delete it' }, { status: 403 });
      }

      await getPool().query(
        `UPDATE storyboard_comments
            SET deleted_at=NOW(), updated_at=NOW()
          WHERE session_id=$1 AND id=$2 AND deleted_at IS NULL`,
        [id, commentId]
      );
      await publishStoryboardEvent({
        storyboardId: id,
        name: 'comment.deleted',
        data: { commentId, actorId: user.id },
      });
      return NextResponse.json({ success: true });
    } catch (error) {
      console.error('Failed to delete Board comment:', error);
      return NextResponse.json({ error: 'Failed to delete Board comment' }, { status: 500 });
    }
  });
}
