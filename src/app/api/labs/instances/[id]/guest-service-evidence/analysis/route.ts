import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAuth } from '@/lib/auth/middleware';
import {
  getGuestServiceReadinessEvidence,
  GuestServiceReadinessEvidenceConflictError,
  storeGuestServiceReadinessAnalysis,
} from '@/lib/execution-evidence/guest-service-readiness';
import { getRuntimeReadinessEvidence } from '@/lib/execution-evidence/runtime-readiness';
import { getDeploymentAuthorizationById } from '@/lib/infrastructure/deployment-authorization';
import {
  buildGuestServiceReadinessFacts,
  guestServiceReadinessAiConfigured,
  guestServiceReadinessAnalysisSchema,
  GuestServiceReadinessInterpretationError,
  guestServiceReadinessModel,
  guestServiceReadinessPayloadSchema,
  interpretGuestServiceReadinessEvidence,
} from '@/lib/infrastructure/guest-service-readiness-evidence';
import { buildRuntimeReadinessFacts } from '@/lib/infrastructure/runtime-readiness-evidence';
import { validateCsrfToken } from '@/lib/security/csrf';
import { checkRateLimit } from '@/lib/security/rate-limit';

export const runtime = 'nodejs';

const requestSchema = z.object({
  evidenceId: z.string().uuid().optional(),
}).strict();

function json(body: unknown, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: { 'Cache-Control': 'private, no-store, max-age=0', Pragma: 'no-cache' },
  });
}

export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  return requireAuth(request, async (req, user) => {
    if (!(await validateCsrfToken(req))) {
      return json({ error: 'Invalid or missing CSRF token', code: 'CSRF_FAILED' }, 403);
    }

    const rateLimit = await checkRateLimit(req, { maxRequests: 10, windowMs: 60_000 }, user.id);
    if (rateLimit) return rateLimit;

    const parsed = requestSchema.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) return json({ error: 'Invalid guest-service analysis request' }, 400);

    const { id } = await context.params;

    try {
      const evidence = await getGuestServiceReadinessEvidence({
        ownerId: user.id,
        labInstanceId: id,
        evidenceId: parsed.data.evidenceId,
      });
      const authorization = await getDeploymentAuthorizationById(user.id, evidence.deploymentAuthorizationId);
      if (!authorization) {
        return json({ error: 'Deployment authorization not found', code: 'DEPLOYMENT_AUTHORIZATION_NOT_FOUND' }, 404);
      }

      const guestPayload = guestServiceReadinessPayloadSchema.parse(evidence.payload);
      const runtimeEvidence = await getRuntimeReadinessEvidence({
        ownerId: user.id,
        labInstanceId: id,
        evidenceId: guestPayload.prerequisiteRuntimeEvidenceId,
      });
      const runtimeFacts = buildRuntimeReadinessFacts({ authorization, evidence: runtimeEvidence });
      const facts = buildGuestServiceReadinessFacts({ authorization, runtimeFacts, evidence });

      if (evidence.state === 'analyzed') {
        if (evidence.analysisKind !== 'guest-service-readiness' || !evidence.analysis) {
          throw new GuestServiceReadinessEvidenceConflictError(
            'Guest-service evidence was already analyzed by another surface.',
            'GUEST_SERVICE_ALREADY_ANALYZED'
          );
        }
        return json({
          analysis: guestServiceReadinessAnalysisSchema.parse(evidence.analysis),
          facts,
          model: evidence.model || guestServiceReadinessModel(),
          evidence: {
            id: evidence.id,
            executionId: evidence.executionId,
            provenance: evidence.provenance,
            state: evidence.state,
          },
          authorization: {
            id: authorization.id,
            planId: authorization.planId,
            state: authorization.state,
          },
        });
      }

      if (!guestServiceReadinessAiConfigured()) {
        return json({
          error: 'Guest-service interpretation is not configured on this OXSIG server',
          code: 'AI_NOT_CONFIGURED',
        }, 503);
      }

      const proposedAnalysis = await interpretGuestServiceReadinessEvidence(facts);
      const model = guestServiceReadinessModel();
      const analyzedEvidence = await storeGuestServiceReadinessAnalysis({
        ownerId: user.id,
        evidenceId: evidence.id,
        analysis: proposedAnalysis as unknown as Record<string, unknown>,
        model,
      });
      const persistedAnalysis = guestServiceReadinessAnalysisSchema.parse(analyzedEvidence.analysis || proposedAnalysis);

      return json({
        analysis: persistedAnalysis,
        facts,
        model: analyzedEvidence.model || model,
        evidence: {
          id: analyzedEvidence.id,
          executionId: analyzedEvidence.executionId,
          provenance: analyzedEvidence.provenance,
          state: analyzedEvidence.state,
        },
        authorization: {
          id: authorization.id,
          planId: authorization.planId,
          state: authorization.state,
        },
      });
    } catch (error) {
      if (
        error instanceof GuestServiceReadinessEvidenceConflictError ||
        error instanceof GuestServiceReadinessInterpretationError
      ) {
        return json({ error: error.message, code: error.code }, 409);
      }
      console.error('Guest-service readiness interpretation failed:', error);
      return json({
        error: error instanceof Error ? error.message : 'Guest-service readiness interpretation failed',
      }, 502);
    }
  });
}
