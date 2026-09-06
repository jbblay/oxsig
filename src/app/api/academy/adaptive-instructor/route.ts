import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAuth } from '@/lib/auth/middleware';
import { validateCsrfToken } from '@/lib/security/csrf';
import { checkRateLimit } from '@/lib/security/rate-limit';
import { captureProductEvent } from '@/lib/analytics/posthog';
import {
  AcademyAdaptiveInstructorError,
  createAcademyInstructorIntervention,
  getAcademyAdaptiveInstructorStatus,
} from '@/lib/academy/adaptive-instructor';

export const runtime = 'nodejs';

const modeSchema = z.enum(['explain', 'guide', 'demonstrate', 'observe']);

const requestSchema = z.discriminatedUnion('action', [
  z.object({
    action: z.literal('status'),
    courseTitle: z.string().trim().min(1).max(200),
    lessonTitle: z.string().trim().min(1).max(200),
  }).strict(),
  z.object({
    action: z.literal('coach'),
    courseTitle: z.string().trim().min(1).max(200),
    lessonTitle: z.string().trim().min(1).max(200),
    requestedMode: modeSchema,
  }).strict(),
]);

export async function POST(request: NextRequest) {
  return requireAuth(request, async (req, user) => {
    if (!(await validateCsrfToken(req))) {
      return NextResponse.json({ error: 'Invalid or missing CSRF token' }, { status: 403 });
    }

    const rateLimit = await checkRateLimit(req, { maxRequests: 20, windowMs: 60_000 }, user.id);
    if (rateLimit) return rateLimit;

    const parsed = requestSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid adaptive instructor request', details: parsed.error.flatten() },
        { status: 400, headers: { 'Cache-Control': 'no-store' } }
      );
    }

    try {
      if (parsed.data.action === 'status') {
        const status = await getAcademyAdaptiveInstructorStatus({
          ownerId: user.id,
          courseTitle: parsed.data.courseTitle,
          lessonTitle: parsed.data.lessonTitle,
        });
        return NextResponse.json({ status }, { headers: { 'Cache-Control': 'no-store' } });
      }

      const intervention = await createAcademyInstructorIntervention({
        ownerId: user.id,
        courseTitle: parsed.data.courseTitle,
        lessonTitle: parsed.data.lessonTitle,
        requestedMode: parsed.data.requestedMode,
      });
      await captureProductEvent({
        distinctId: user.clerkUserId || user.id,
        event: 'academy_instructor_intervention',
        properties: {
          requested_mode: intervention.requestedMode,
          recommended_mode: intervention.recommendedMode,
          applied_mode: intervention.appliedMode,
          hint_level: intervention.hintLevel,
          independence_score: intervention.independence.score,
        },
      });
      return NextResponse.json(
        { intervention },
        { headers: { 'Cache-Control': 'no-store' } }
      );
    } catch (error) {
      if (error instanceof AcademyAdaptiveInstructorError) {
        return NextResponse.json(
          { error: error.message, code: error.code },
          { status: error.status, headers: { 'Cache-Control': 'no-store' } }
        );
      }
      console.error('Adaptive Academy instructor request failed:', error);
      return NextResponse.json(
        { error: error instanceof Error ? error.message.slice(0, 500) : 'Adaptive instructor failed' },
        { status: 502, headers: { 'Cache-Control': 'no-store' } }
      );
    }
  });
}
