import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth/middleware';
import { validateCsrfToken } from '@/lib/security/csrf';
import { checkRateLimit } from '@/lib/security/rate-limit';
import {
  academyRequestSchema,
  answerAcademyQuestion,
  evaluateAcademyPractice,
  generateAcademyCourse,
} from '@/lib/academy/server';

export const runtime = 'nodejs';

export async function POST(request: NextRequest) {
  return requireAuth(request, async (req, user) => {
    if (!(await validateCsrfToken(req))) {
      return NextResponse.json({ error: 'Invalid or missing CSRF token' }, { status: 403 });
    }

    const rateLimit = await checkRateLimit(req, { maxRequests: 20, windowMs: 60_000 }, user.id);
    if (rateLimit) return rateLimit;

    const parsed = academyRequestSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid Academy request' }, { status: 400 });
    }

    try {
      if (parsed.data.action === 'generate') {
        const course = await generateAcademyCourse(parsed.data.prompt);
        return NextResponse.json({ course });
      }

      if (parsed.data.action === 'ask') {
        const answer = await answerAcademyQuestion({
          question: parsed.data.question,
          courseTitle: parsed.data.courseTitle,
          lessonTitle: parsed.data.lessonTitle,
          lessonContext: parsed.data.lessonContext,
        });
        return NextResponse.json({ answer });
      }

      const evaluation = await evaluateAcademyPractice({
        courseTitle: parsed.data.courseTitle,
        lessonTitle: parsed.data.lessonTitle,
        instruction: parsed.data.instruction,
        command: parsed.data.command,
        expected: parsed.data.expected,
        stdout: parsed.data.stdout,
        stderr: parsed.data.stderr,
        exitCode: parsed.data.exitCode,
      });
      return NextResponse.json({ evaluation });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'AI Academy request failed';
      return NextResponse.json({ error: message.slice(0, 500) }, { status: 502 });
    }
  });
}