import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { captureProductEvent } from '@/lib/analytics/posthog';
import { generateAcademyCourse } from '@/lib/academy/server';
import { requireAuth } from '@/lib/auth/middleware';
import { validateCsrfToken } from '@/lib/security/csrf';
import { checkRateLimit } from '@/lib/security/rate-limit';

export const runtime = 'nodejs';

const requestSchema = z.object({
  prompt: z.string().trim().min(3).max(800),
}).strict();

export async function POST(request: NextRequest) {
  return requireAuth(request, async (req, user) => {
    if (!(await validateCsrfToken(req))) {
      return NextResponse.json({ error: 'Invalid or missing CSRF token' }, { status: 403 });
    }

    const rateLimit = await checkRateLimit(req, { maxRequests: 8, windowMs: 60_000 }, user.id);
    if (rateLimit) return rateLimit;

    const parsed = requestSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json({ error: 'Enter a topic between 3 and 800 characters' }, { status: 400 });
    }

    try {
      const course = await generateAcademyCourse(parsed.data.prompt);
      await captureProductEvent({
        distinctId: user.clerkUserId || user.id,
        event: 'academy_topic_explored',
        properties: {
          lesson_count: Array.isArray(course.lessons) ? course.lessons.length : 0,
        },
      });

      return NextResponse.json(
        {
          exploration: {
            prompt: parsed.data.prompt,
            course,
            durable: false,
            capabilityProgressAffected: false,
          },
        },
        { headers: { 'Cache-Control': 'no-store' } }
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Academy could not explore this topic';
      return NextResponse.json({ error: message.slice(0, 500) }, { status: 502 });
    }
  });
}
