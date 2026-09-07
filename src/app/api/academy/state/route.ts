import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import type { AcademyCourse } from '@/lib/academy/types';
import {
  archiveActiveAcademyCourse,
  getAcademyState,
  importAcademyCourseIfMissing,
  updateAcademyProgress,
} from '@/lib/academy/persistence';
import { requireAuth } from '@/lib/auth/middleware';
import { recordLearningActivity } from '@/lib/learning/activity';
import { validateCsrfToken } from '@/lib/security/csrf';
import { checkRateLimit } from '@/lib/security/rate-limit';

export const runtime = 'nodejs';

const progressSchema = z.object({
  activeIndex: z.number().int().min(0).max(1000),
  completedLessonIds: z.array(z.string().min(1).max(64)).max(256),
}).strict();

const importedCourseSchema = z.object({
  title: z.string().min(1).max(160),
  topic: z.string().min(1).max(160),
  level: z.enum(['beginner', 'intermediate', 'advanced']),
  overview: z.string().min(1).max(1800),
  estimatedMinutes: z.number().int().min(1).max(1440),
  objectives: z.array(z.string().min(1).max(300)).max(16),
  prerequisites: z.array(z.string().min(1).max(300)).max(16),
  lessons: z.array(z.object({
    id: z.string().min(1).max(64),
    title: z.string().min(1).max(200),
    summary: z.string().min(1).max(1000),
    explanation: z.string().min(1).max(8000),
    keyPoints: z.array(z.string().min(1).max(500)).max(16),
    visual: z.object({
      title: z.string().min(1).max(200),
      nodes: z.array(z.string().min(1).max(200)).max(16),
    }).strict(),
    practice: z.object({
      title: z.string().min(1).max(200),
      instruction: z.string().min(1).max(1600),
      command: z.string().min(1).max(1000),
      expected: z.string().min(1).max(1600),
      labRequired: z.boolean(),
    }).strict().nullable(),
    checkpoint: z.string().min(1).max(1000),
  }).strict()).min(1).max(12),
}).strict();

const importSchema = z.object({
  action: z.literal('import'),
  course: importedCourseSchema,
  progress: progressSchema,
}).strict();

export async function GET(request: NextRequest) {
  return requireAuth(request, async (req, user) => {
    const rateLimit = await checkRateLimit(req, { maxRequests: 60, windowMs: 60_000 }, user.id);
    if (rateLimit) return rateLimit;
    const state = await getAcademyState(user.id);
    return NextResponse.json({ state }, { headers: { 'Cache-Control': 'no-store' } });
  });
}

export async function POST(request: NextRequest) {
  return requireAuth(request, async (req, user) => {
    if (!(await validateCsrfToken(req))) {
      return NextResponse.json({ error: 'Invalid or missing CSRF token' }, { status: 403 });
    }
    const rateLimit = await checkRateLimit(req, { maxRequests: 12, windowMs: 60_000 }, user.id);
    if (rateLimit) return rateLimit;

    const parsed = importSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid Academy import state' }, { status: 400 });
    }

    const state = await importAcademyCourseIfMissing(
      user.id,
      parsed.data.course as AcademyCourse,
      parsed.data.progress
    );
    await recordLearningActivity(user.id, 'academy');
    return NextResponse.json({ state });
  });
}

export async function PATCH(request: NextRequest) {
  return requireAuth(request, async (req, user) => {
    if (!(await validateCsrfToken(req))) {
      return NextResponse.json({ error: 'Invalid or missing CSRF token' }, { status: 403 });
    }
    const rateLimit = await checkRateLimit(req, { maxRequests: 45, windowMs: 60_000 }, user.id);
    if (rateLimit) return rateLimit;

    const parsed = progressSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid Academy progress state' }, { status: 400 });
    }

    try {
      await updateAcademyProgress(user.id, parsed.data);
      await recordLearningActivity(user.id, 'academy');
      const state = await getAcademyState(user.id);
      return NextResponse.json({ state });
    } catch (error) {
      if (error instanceof Error && error.message === 'No active Academy course') {
        return NextResponse.json({ error: error.message }, { status: 409 });
      }
      throw error;
    }
  });
}

export async function DELETE(request: NextRequest) {
  return requireAuth(request, async (req, user) => {
    if (!(await validateCsrfToken(req))) {
      return NextResponse.json({ error: 'Invalid or missing CSRF token' }, { status: 403 });
    }
    const rateLimit = await checkRateLimit(req, { maxRequests: 12, windowMs: 60_000 }, user.id);
    if (rateLimit) return rateLimit;
    await archiveActiveAcademyCourse(user.id);
    return NextResponse.json({ ok: true });
  });
}
