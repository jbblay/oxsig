import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAuth } from '@/lib/auth/middleware';
import {
  AccessPathReadinessEvidenceConflictError,
  getAccessPathReadinessEvidence,
  storeAccessPathReadinessAnalysis,
} from '@/lib/execution-evidence/access-path-readiness';
import { getGuestServiceReadinessEvidence } from '@/lib/execution-evidence/guest-service-readiness';
import { getRuntimeReadinessEvidence } from '@/lib/execution-evidence/runtime-readiness';
import {
  accessPathReadinessAiConfigured,
  accessPathReadinessAnalysisSchema,
  accessPathReadinessModel,
  accessPathReadinessPayloadSchema,
  buildAccessPathReadinessFacts,
  AccessPathReadinessInterpretationError,
  interpretAccessPathReadinessEvidence,
} from '@/lib/infrastructure/access-path-readiness-evidence';
import { getDeploymentAuthorizationById } from '@/lib/infrastructure/deployment-authorization';
import {
  buildGuestServiceReadinessFacts,
  guestServiceReadinessPayloadSchema,
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
    if (!parsed.success) return json({ error: 'Invalid access-path analysis request' }, 400);
    const { id } = await context.params;

    try {
      const evidence = await getAccessPathReadinessEvidence({
        ownerId: user.id,
        labInstanceId: id,
        evidenceId: parsed.data.evidenceId,
      });
      const authorization = await getDeploymentAuthorizationById(user.id, evidence.deploymentAuthorizationId);
      if (!authorization) {
        return json({ error: 'Deployment authorization not found', code: 'DEPLOYMENT_AUTHORIZATION_NOT_FOUND' }, 404);
      }

      const accessPayload = accessPathReadinessPayloadSchema.parse(evidence.payload);
      const guestEvidence = await getGuestServiceReadinessEvidence({
        ownerId: user.id,
        labInstanceId: id,
        evidenceId: accessPayload.prerequisiteGuestEvidenceId,
      });
      const guestPayload = guestServiceReadinessPayloadSchema.parse(guestEvidence.payload);
      const runtimeEvidence = await getRuntimeReadinessEvidence({
        ownerId: user.id,
        labInstanceId: id,
        evidenceId: guestPayload.prerequisiteRuntimeEvidenceId,
      });
      const runtimeFacts = buildRuntimeReadinessFacts({ authorization, evidence: runtimeEvidence });
      const guestFacts = buildGuestServiceReadinessFacts({ authorization, runtimeFacts, evidence: guestEvidence });
      const facts = buildAccessPathReadinessFacts({ authorization, guestFacts, evidence });

      if (evidence.state === 'analyzed') {
        if (evidence.analysisKind !== 'access-path-readiness' || !evidence.analysis) {
          throw new AccessPathReadinessEvidenceConflictError(
            'Access-path evidence was already analyzed by another surface.',
            'ACCESS_PATH_ALREADY_ANALYZED'
          );
        }
        return json({
          analysis: accessPathReadinessAnalysisSchema.parse(evidence.analysis),
          facts,
          model: evidence.model || accessPathReadinessModel(),
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

      if (!accessPathReadinessAiConfigured()) {
        return json({
          error: 'Access-path interpretation is not configured on this OXSIG server',
          code: 'AI_NOT_CONFIGURED',
        }, 503);
      }

      const proposedAnalysis = await interpretAccessPathReadinessEvidence(facts);
      const model = accessPathReadinessModel();
      const analyzedEvidence = await storeAccessPathReadinessAnalysis({
        ownerId: user.id,
        evidenceId: evidence.id,
        analysis: proposedAnalysis as unknown as Record<string, unknown>,
        model,
      });
      const persistedAnalysis = accessPathReadinessAnalysisSchema.parse(analyzedEvidence.analysis || proposedAnalysis);

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
        error instanceof AccessPathReadinessEvidenceConflictError ||
        error instanceof AccessPathReadinessInterpretationError
      ) {
        return json({ error: error.message, code: error.code }, 409);
      }
      console.error('Access-path readiness interpretation failed:', error);
      return json({
        error: error instanceof Error ? error.message : 'Access-path readiness interpretation failed',
      }, 502);
    }
  });
}
