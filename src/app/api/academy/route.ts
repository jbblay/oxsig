import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth/middleware';
import { validateCsrfToken } from '@/lib/security/csrf';
import { checkRateLimit } from '@/lib/security/rate-limit';
import { captureProductEvent } from '@/lib/analytics/posthog';
import {
  academyRequestSchema,
  answerAcademyQuestion,
  evaluateAcademyPractice,
  generateAcademyCourse,
} from '@/lib/academy/server';
import {
  createAcademyCourse,
  recordAcademyPractice,
  recordAcademyQuestion,
} from '@/lib/academy/persistence';
import {
  ExecutionEvidenceConflictError,
  getTerminalEvidenceForAnalysis,
  storeExecutionEvidenceAnalysis,
} from '@/lib/execution-evidence/server';

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
        const courseId = await createAcademyCourse(user.id, parsed.data.prompt, course);
        await captureProductEvent({
          distinctId: user.clerkUserId || user.id,
          event: 'academy_course_created',
          properties: {
            lesson_count: Array.isArray(course.lessons) ? course.lessons.length : 0,
          },
        });
        return NextResponse.json({ courseId, course });
      }

      if (parsed.data.action === 'ask') {
        const answer = await answerAcademyQuestion({
          question: parsed.data.question,
          courseTitle: parsed.data.courseTitle,
          lessonTitle: parsed.data.lessonTitle,
          lessonContext: parsed.data.lessonContext,
        });
        await recordAcademyQuestion({
          ownerId: user.id,
          courseTitle: parsed.data.courseTitle,
          lessonTitle: parsed.data.lessonTitle,
          question: parsed.data.question,
          answer,
        });
        return NextResponse.json({ answer });
      }

      // Keep the browser evidence fields in the request schema for compatibility,
      // but evaluate only the one-time owner-bound record persisted by Oxsig after
      // the visible terminal checkpoint completed.
      const evidence = await getTerminalEvidenceForAnalysis({
        ownerId: user.id,
        command: parsed.data.command,
        surface: 'ai-practitioner',
      });

      if (evidence.state === 'analyzed') {
        if (evidence.analysisKind !== 'academy' || !evidence.analysis) {
          throw new ExecutionEvidenceConflictError(
            'This execution evidence was already analyzed by another learning surface.',
            'EVIDENCE_ALREADY_ANALYZED'
          );
        }
        return NextResponse.json({
          evaluation: evidence.analysis,
          evidence: {
            id: evidence.id,
            executionId: evidence.executionId,
            provenance: evidence.provenance,
            state: evidence.state,
          },
        });
      }

      const command = evidence.command || parsed.data.command;
      const exitCode = evidence.exitCode ?? -1;
      const evaluation = await evaluateAcademyPractice({
        courseTitle: parsed.data.courseTitle,
        lessonTitle: parsed.data.lessonTitle,
        instruction: parsed.data.instruction,
        command,
        expected: parsed.data.expected,
        stdout: evidence.stdout,
        stderr: evidence.stderr,
        exitCode,
      });

      const model = process.env.OXSIG_AI_MODEL?.trim() || 'gpt-5.4-mini';
      const analyzedEvidence = await storeExecutionEvidenceAnalysis({
        ownerId: user.id,
        evidenceId: evidence.id,
        analysisKind: 'academy',
        analysis: evaluation as unknown as Record<string, unknown>,
        model,
      });

      await recordAcademyPractice({
        ownerId: user.id,
        courseTitle: parsed.data.courseTitle,
        lessonTitle: parsed.data.lessonTitle,
        command,
        stdout: evidence.stdout,
        stderr: evidence.stderr,
        exitCode,
        evaluation,
      });
      await captureProductEvent({
        distinctId: user.clerkUserId || user.id,
        event: 'academy_checkpoint_evaluated',
        properties: {
          exit_code: exitCode,
          evidence_provenance: evidence.provenance,
        },
      });
      return NextResponse.json({
        evaluation,
        evidence: {
          id: analyzedEvidence.id,
          executionId: analyzedEvidence.executionId,
          provenance: analyzedEvidence.provenance,
          state: analyzedEvidence.state,
        },
      });
    } catch (error) {
      if (error instanceof ExecutionEvidenceConflictError) {
        return NextResponse.json(
          { error: error.message, code: error.code },
          { status: 409, headers: { 'Cache-Control': 'no-store' } }
        );
      }
      const message = error instanceof Error ? error.message : 'AI Academy request failed';
      return NextResponse.json({ error: message.slice(0, 500) }, { status: 502 });
    }
  });
}
