import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAuth } from '@/lib/auth/middleware';
import { validateCsrfToken } from '@/lib/security/csrf';
import { checkRateLimit } from '@/lib/security/rate-limit';
import { academyModel, evaluateAcademyReflection } from '@/lib/academy/server';
import {
  AcademyReflectionError,
  claimAcademyReflection,
  completeAcademyReflection,
  createAcademyPrediction,
  releaseAcademyReflectionClaim,
} from '@/lib/academy/reflections';

export const runtime = 'nodejs';

const reflectionRequestSchema = z.discriminatedUnion('action', [
  z.object({
    action: z.literal('predict'),
    courseTitle: z.string().trim().min(1).max(200),
    lessonTitle: z.string().trim().min(1).max(200),
    prediction: z.string().trim().min(3).max(2000),
  }).strict(),
  z.object({
    action: z.literal('reflect'),
    reflectionId: z.string().uuid(),
    evidenceId: z.string().uuid(),
    explanation: z.string().trim().min(3).max(4000),
  }).strict(),
]);

export async function POST(request: NextRequest) {
  return requireAuth(request, async (req, user) => {
    if (!(await validateCsrfToken(req))) {
      return NextResponse.json({ error: 'Invalid or missing CSRF token' }, { status: 403 });
    }

    const rateLimit = await checkRateLimit(req, { maxRequests: 20, windowMs: 60_000 }, user.id);
    if (rateLimit) return rateLimit;

    const parsed = reflectionRequestSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid Academy reflection request', details: parsed.error.flatten() },
        { status: 400, headers: { 'Cache-Control': 'no-store' } }
      );
    }

    try {
      if (parsed.data.action === 'predict') {
        const reflection = await createAcademyPrediction({
          ownerId: user.id,
          courseTitle: parsed.data.courseTitle,
          lessonTitle: parsed.data.lessonTitle,
          prediction: parsed.data.prediction,
        });
        return NextResponse.json(
          { reflection },
          { headers: { 'Cache-Control': 'no-store' } }
        );
      }

      const claimResult = await claimAcademyReflection({
        ownerId: user.id,
        reflectionId: parsed.data.reflectionId,
        evidenceId: parsed.data.evidenceId,
        explanation: parsed.data.explanation,
      });

      if (claimResult.existing) {
        return NextResponse.json(
          { reflection: claimResult.existing, understanding: null, replayed: true },
          { headers: { 'Cache-Control': 'no-store' } }
        );
      }

      const claim = claimResult.claim;
      if (!claim) {
        throw new AcademyReflectionError('The Academy reflection claim was not created.', 'REFLECTION_CLAIM_CONFLICT');
      }

      let completed;
      try {
        const evaluation = await evaluateAcademyReflection({
          courseTitle: claim.course.title,
          lessonTitle: claim.lessonTitle,
          instruction: claim.instruction,
          expected: claim.expected,
          prediction: claim.reflection.prediction,
          explanation: claim.reflection.explanation || parsed.data.explanation,
          command: claim.evidence.command,
          stdout: claim.evidence.stdout,
          stderr: claim.evidence.stderr,
          exitCode: claim.evidence.exitCode,
          practiceEvaluation: claim.evidence.practiceEvaluation,
        });

        completed = await completeAcademyReflection({
          ownerId: user.id,
          reflectionId: claim.reflection.id,
          evidenceId: claim.evidence.id,
          evaluation,
          model: academyModel(),
        });
      } catch (error) {
        await releaseAcademyReflectionClaim({
          ownerId: user.id,
          reflectionId: claim.reflection.id,
          evidenceId: claim.evidence.id,
        }).catch(() => undefined);
        throw error;
      }

      return NextResponse.json(
        { ...completed, replayed: false },
        { headers: { 'Cache-Control': 'no-store' } }
      );
    } catch (error) {
      if (error instanceof AcademyReflectionError) {
        return NextResponse.json(
          { error: error.message, code: error.code },
          { status: error.status, headers: { 'Cache-Control': 'no-store' } }
        );
      }
      console.error('Academy reflection request failed:', error);
      return NextResponse.json(
        { error: error instanceof Error ? error.message.slice(0, 500) : 'Academy reflection failed' },
        { status: 502, headers: { 'Cache-Control': 'no-store' } }
      );
    }
  });
}
