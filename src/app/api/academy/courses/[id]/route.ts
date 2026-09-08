import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import {
  activateAcademyCourse,
  archiveAcademyCourse,
  deleteAcademyCourse,
  getOwnedAcademyCourse,
} from '@/lib/academy/course-lifecycle';
import { requireAuth } from '@/lib/auth/middleware';
import { validateCsrfToken } from '@/lib/security/csrf';
import { checkRateLimit } from '@/lib/security/rate-limit';

export const runtime = 'nodejs';

type Context = { params: Promise<{ id: string }> };
const idSchema = z.string().uuid();
const lifecycleSchema = z.object({
  action: z.enum(['activate', 'archive']),
}).strict();

export async function GET(request: NextRequest, context: Context) {
  return requireAuth(request, async (req, user) => {
    const rateLimit = await checkRateLimit(req, { maxRequests: 60, windowMs: 60_000 }, user.id);
    if (rateLimit) return rateLimit;

    const { id } = await context.params;
    if (!idSchema.safeParse(id).success) {
      return NextResponse.json({ error: 'Invalid Academy course ID' }, { status: 400 });
    }

    const course = await getOwnedAcademyCourse(user.id, id);
    if (!course) return NextResponse.json({ error: 'Academy course not found' }, { status: 404 });
    return NextResponse.json({ course }, { headers: { 'Cache-Control': 'no-store' } });
  });
}

export async function PATCH(request: NextRequest, context: Context) {
  return requireAuth(request, async (req, user) => {
    if (!(await validateCsrfToken(req))) {
      return NextResponse.json({ error: 'Invalid or missing CSRF token' }, { status: 403 });
    }
    const rateLimit = await checkRateLimit(req, { maxRequests: 20, windowMs: 60_000 }, user.id);
    if (rateLimit) return rateLimit;

    const { id } = await context.params;
    if (!idSchema.safeParse(id).success) {
      return NextResponse.json({ error: 'Invalid Academy course ID' }, { status: 400 });
    }
    const parsed = lifecycleSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid Academy course action' }, { status: 400 });
    }

    const found = parsed.data.action === 'activate'
      ? await activateAcademyCourse(user.id, id)
      : await archiveAcademyCourse(user.id, id);
    if (!found) return NextResponse.json({ error: 'Academy course not found' }, { status: 404 });

    const course = await getOwnedAcademyCourse(user.id, id);
    return NextResponse.json({ course });
  });
}

export async function DELETE(request: NextRequest, context: Context) {
  return requireAuth(request, async (req, user) => {
    if (!(await validateCsrfToken(req))) {
      return NextResponse.json({ error: 'Invalid or missing CSRF token' }, { status: 403 });
    }
    const rateLimit = await checkRateLimit(req, { maxRequests: 10, windowMs: 60_000 }, user.id);
    if (rateLimit) return rateLimit;

    const { id } = await context.params;
    if (!idSchema.safeParse(id).success) {
      return NextResponse.json({ error: 'Invalid Academy course ID' }, { status: 400 });
    }

    const deleted = await deleteAcademyCourse(user.id, id);
    if (!deleted) return NextResponse.json({ error: 'Academy course not found' }, { status: 404 });
    return NextResponse.json({ deleted: true });
  });
}
