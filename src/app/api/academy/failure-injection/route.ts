import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAuth } from '@/lib/auth/middleware';
import { validateCsrfToken } from '@/lib/security/csrf';
import { checkRateLimit } from '@/lib/security/rate-limit';
import { captureProductEvent } from '@/lib/analytics/posthog';
import {
  AcademyFailureInjectionError,
  cleanupAcademyFailure,
  FAILURE_TEMPLATE_ID,
  injectAcademyFailure,
  verifyAcademyFailureRemediation,
} from '@/lib/academy/failure-injection';

export const runtime = 'nodejs';

const requestSchema = z.discriminatedUnion('action', [
  z.object({
    action: z.literal('inject'),
    courseTitle: z.string().trim().min(1).max(200),
    lessonTitle: z.string().trim().min(1).max(200),
    labInstanceId: z.string().uuid(),
    templateId: z.literal(FAILURE_TEMPLATE_ID),
    confirm: z.literal(true),
  }).strict(),
  z.object({
    action: z.literal('verify'),
    attemptId: z.string().uuid(),
  }).strict(),
  z.object({
    action: z.literal('cleanup'),
    attemptId: z.string().uuid(),
  }).strict(),
]);

export async function POST(request: NextRequest) {
  return requireAuth(request, async (req, user) => {
    if (!(await validateCsrfToken(req))) {
      return NextResponse.json({ error: 'Invalid or missing CSRF token' }, { status: 403 });
    }

    const rateLimit = await checkRateLimit(req, { maxRequests: 10, windowMs: 60_000 }, user.id);
    if (rateLimit) return rateLimit;

    const parsed = requestSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid failure-injection request', details: parsed.error.flatten() },
        { status: 400, headers: { 'Cache-Control': 'no-store' } }
      );
    }

    try {
      if (parsed.data.action === 'inject') {
        const attempt = await injectAcademyFailure({
          ownerId: user.id,
          courseTitle: parsed.data.courseTitle,
          lessonTitle: parsed.data.lessonTitle,
          labInstanceId: parsed.data.labInstanceId,
        });
        await captureProductEvent({
          distinctId: user.clerkUserId || user.id,
          event: 'academy_failure_injected',
          properties: { template_id: attempt.templateId },
        });
        return NextResponse.json({ attempt }, { headers: { 'Cache-Control': 'no-store' } });
      }

      if (parsed.data.action === 'verify') {
        const attempt = await verifyAcademyFailureRemediation({
          ownerId: user.id,
          attemptId: parsed.data.attemptId,
        });
        await captureProductEvent({
          distinctId: user.clerkUserId || user.id,
          event: 'academy_failure_verified',
          properties: { remediated: attempt.state === 'remediated', template_id: attempt.templateId },
        });
        return NextResponse.json({ attempt }, { headers: { 'Cache-Control': 'no-store' } });
      }

      const attempt = await cleanupAcademyFailure({
        ownerId: user.id,
        attemptId: parsed.data.attemptId,
      });
      await captureProductEvent({
        distinctId: user.clerkUserId || user.id,
        event: 'academy_failure_cleaned',
        properties: { template_id: attempt.templateId },
      });
      return NextResponse.json({ attempt }, { headers: { 'Cache-Control': 'no-store' } });
    } catch (error) {
      if (error instanceof AcademyFailureInjectionError) {
        return NextResponse.json(
          { error: error.message, code: error.code },
          { status: error.status, headers: { 'Cache-Control': 'no-store' } }
        );
      }
      console.error('Academy failure-injection request failed:', error);
      return NextResponse.json(
        { error: error instanceof Error ? error.message.slice(0, 500) : 'Failure lesson request failed' },
        { status: 502, headers: { 'Cache-Control': 'no-store' } }
      );
    }
  });
}
