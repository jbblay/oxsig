import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAuth } from '@/lib/auth/middleware';
import { getPool } from '@/lib/db/pool';
import { publishStoryboardEvent } from '@/lib/realtime/ably';
import { checkRateLimit } from '@/lib/security/rate-limit';
import { validateCsrfToken } from '@/lib/security/csrf';
import { getStoryboardAccess } from '@/lib/storyboards/server';
import { getStoryboardComment, listStoryboardComments } from '@/lib/storyboards/comments';
import { storyboardIdSchema } from '@/lib/storyboards/validation';

export const runtime = 'nodejs';

type RouteContext = { params: Promise<{ id: string }> };

const createCommentSchema = z.object({
  x: z.number().min(0).max(1),
  y: z.number().min(0).max(1),
  body: z.string().trim().min(1).max(2000),
});

export async function GET(request: NextRequest, { params }: RouteContext) {
  return requireAuth(request, async (_req, user) => {
    const { id } = await params;
    if (!storyboardIdSchema.safeParse(id).success) {
      return NextResponse.json({ error: 'Invalid Board ID' }, { status: 400 });
    }
    try {
      const access = await getStoryboardAccess(id, user.id);
      if (!access) return NextResponse.json({ error: 'Board not found' }, { status: 404 });
      return NextResponse.json({ comments: await listStoryboardComments(id) });
    } catch (error) {
      console.error('Failed to list Board comments:', error);
      return NextResponse.json({ error: 'Failed to load Board comments' }, { status: 500 });
    }
  });
}

export async function POST(request: NextRequest, { params }: RouteContext) {
  return requireAuth(request, async (req, user) => {
    if (!(await validateCsrfToken(req))) {
      return NextResponse.json({ error: 'Invalid or missing CSRF token' }, { status: 403 });
    }
    const { id } = await params;
    if (!storyboardIdSchema.safeParse(id).success) {
      return NextResponse.json({ error: 'Invalid Board ID' }, { status: 400 });
    }
    const rateLimit = await checkRateLimit(
      req,
      { maxRequests: 60, windowMs: 60 * 60_000 },
      `${user.id}:${id}:board-comments`
    );
    if (rateLimit) return rateLimit;

    const parsed = createCommentSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid Board comment', details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    try {
      const access = await getStoryboardAccess(id, user.id);
      if (!access) return NextResponse.json({ error: 'Board not found' }, { status: 404 });

      const inserted = await getPool().query(
        `INSERT INTO storyboard_comments (session_id, author_id, point_x, point_y, body)
         VALUES ($1,$2,$3,$4,$5)
         RETURNING id`,
        [id, user.id, parsed.data.x, parsed.data.y, parsed.data.body]
      );
      const comment = await getStoryboardComment(id, inserted.rows[0].id);
      if (!comment) throw new Error('COMMENT_INSERT_NOT_VISIBLE');

      await publishStoryboardEvent({
        storyboardId: id,
        name: 'comment.created',
        data: { commentId: comment.id, actorId: user.id },
      });
      return NextResponse.json({ comment }, { status: 201 });
    } catch (error) {
      console.error('Failed to create Board comment:', error);
      return NextResponse.json({ error: 'Failed to create Board comment' }, { status: 500 });
    }
  });
}
