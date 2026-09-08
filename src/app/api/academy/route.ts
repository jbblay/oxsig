import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAuth } from '@/lib/auth/middleware';
import { validateCsrfToken } from '@/lib/security/csrf';
import { checkRateLimit } from '@/lib/security/rate-limit';
import { captureProductEvent } from '@/lib/analytics/posthog';
import { answerAdaptiveAcademyQuestion } from '@/lib/academy/adaptive-question';
import {
  academyRequestSchema,
  evaluateAcademyPractice,
  generateAcademyCourse,
} from '@/lib/academy/server';
import {
  createAcademyCourse,
  recordAcademyPractice,
  recordAcademyQuestion,
} from '@/lib/academy/persistence';
import type { AcademyPracticeEvaluation } from '@/lib/academy/types';
import {
  ExecutionEvidenceConflictError,
  getTerminalEvidenceForAnalysis,
  storeExecutionEvidenceAnalysis,
} from '@/lib/execution-evidence/server';

export const runtime = 'nodejs';

const idSchema = z.string().uuid();

export async function POST(request: NextRequest) {
  return requireAuth(request, async (req, user) => {
    if (!(await validateCsrfToken(req))) {
      return NextResponse.json({ error: 'Invalid or missing CSRF token' }, { status: 403 });
    }

    const rateLimit = await checkRateLimit(req, { maxRequests: 20, windowMs: 60_000 }, user.id);
    if (rateLimit) return rateLimit;

    const rawBody = await req.json().catch(() => null) as Record<string, unknown> | null;
    let exactEvidenceId: string | undefined;
    let exactLabInstanceId: string | undefined;
    let schemaBody: Record<string, unknown> | null = rawBody;
    if (rawBody?.action === 'evaluate') {
      const parsedEvidenceId = idSchema.safeParse(rawBody.evidenceId);
      const parsedLabInstanceId = idSchema.safeParse(rawBody.labInstanceId);
      if (!parsedEvidenceId.success || !parsedLabInstanceId.success) {
        return NextResponse.json(
          { error: 'Exact lab and execution evidence identifiers are required for Academy evaluation' },
          { status: 400 }
        );
      }
      exactEvidenceId = parsedEvidenceId.data;
      exactLabInstanceId = parsedLabInstanceId.data;
      schemaBody = { ...rawBody };
      delete schemaBody.evidenceId;
      delete schemaBody.labInstanceId;
    }

    const parsed = academyRequestSchema.safeParse(schemaBody);
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
        const answer = await answerAdaptiveAcademyQuestion({
          ownerId: user.id,
          question: parsed.data.question,
          courseTitle: parsed.data.courseTitle,
          lessonTitle: parsed.data.lessonTitle,
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

      const evidence = await getTerminalEvidenceForAnalysis({
        ownerId: user.id,
        labInstanceId: exactLabInstanceId!,
        command: parsed.data.command,
        surface: 'academy',
        evidenceId: exactEvidenceId!,
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
      const evidencePayload = analyzedEvidence.payload || {};
      const risk = evidencePayload.risk === 'changes-system'
        ? 'changes-system' as const
        : evidencePayload.risk === 'read-only'
          ? 'read-only' as const
          : undefined;
      const executionReceiptId = typeof evidencePayload.executionReceiptId === 'string'
        ? evidencePayload.executionReceiptId
        : undefined;
      const terminalSessionId = typeof evidencePayload.terminalSessionId === 'string'
        ? evidencePayload.terminalSessionId
        : undefined;
      const persistedEvaluation: AcademyPracticeEvaluation = {
        ...evaluation,
        evidenceBinding: {
          evidenceId: analyzedEvidence.id,
          executionId: analyzedEvidence.executionId,
          labInstanceId: exactLabInstanceId!,
          provenance: analyzedEvidence.provenance,
          ...(executionReceiptId ? { executionReceiptId } : {}),
          ...(terminalSessionId ? { terminalSessionId } : {}),
          ...(risk ? { risk } : {}),
          surface: 'academy',
        },
      };

      await recordAcademyPractice({
        ownerId: user.id,
        courseTitle: parsed.data.courseTitle,
        lessonTitle: parsed.data.lessonTitle,
        labInstanceId: exactLabInstanceId,
        command,
        stdout: evidence.stdout,
        stderr: evidence.stderr,
        exitCode,
        evaluation: persistedEvaluation,
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