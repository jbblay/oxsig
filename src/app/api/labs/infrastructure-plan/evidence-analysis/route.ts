import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAuth } from '@/lib/auth/middleware';
import { validateCsrfToken } from '@/lib/security/csrf';
import { checkRateLimit } from '@/lib/security/rate-limit';
import {
  ExecutionEvidenceConflictError,
  getDeploymentEvidenceForAnalysis,
  storeExecutionEvidenceAnalysis,
} from '@/lib/execution-evidence/server';
import { getDeploymentAuthorizationById } from '@/lib/infrastructure/deployment-authorization';
import {
  buildDeploymentEvidenceFacts,
  deploymentEvidenceAiConfigured,
  deploymentEvidenceModel,
  DeploymentEvidenceInterpretationError,
  interpretDeploymentEvidence,
} from '@/lib/infrastructure/deployment-evidence-interpreter';

export const runtime = 'nodejs';

const requestSchema = z.object({
  authorizationId: z.string().uuid(),
}).strict();

function noStoreJson(body: unknown, init?: { status?: number }) {
  return NextResponse.json(body, {
    status: init?.status,
    headers: { 'Cache-Control': 'no-store' },
  });
}

export async function POST(request: NextRequest) {
  return requireAuth(request, async (req, user) => {
    if (!(await validateCsrfToken(req))) {
      return noStoreJson({ error: 'Invalid or missing CSRF token' }, { status: 403 });
    }

    const rateLimit = await checkRateLimit(req, { maxRequests: 12, windowMs: 60_000 }, user.id);
    if (rateLimit) return rateLimit;

    const parsed = requestSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return noStoreJson({ error: 'Invalid deployment evidence analysis request' }, { status: 400 });
    }

    try {
      const authorization = await getDeploymentAuthorizationById(user.id, parsed.data.authorizationId);
      if (!authorization) {
        return noStoreJson({ error: 'Deployment authorization not found' }, { status: 404 });
      }
      if (!['evidence_recorded', 'analyzed'].includes(authorization.state)) {
        return noStoreJson({
          error: authorization.state === 'executing'
            ? 'Provider-attested deployment evidence is not ready yet.'
            : 'This deployment authorization is not ready for evidence interpretation.',
          code: 'DEPLOYMENT_EVIDENCE_NOT_READY',
        }, { status: 409 });
      }

      const evidence = await getDeploymentEvidenceForAnalysis({
        ownerId: user.id,
        authorizationId: authorization.id,
      });
      const facts = buildDeploymentEvidenceFacts({ authorization, evidence });

      if (evidence.state === 'analyzed') {
        if (evidence.analysisKind !== 'deployment' || !evidence.analysis) {
          throw new ExecutionEvidenceConflictError(
            'Deployment evidence was already analyzed by a different surface.',
            'EVIDENCE_ALREADY_ANALYZED'
          );
        }
        return noStoreJson({
          analysis: evidence.analysis,
          facts,
          model: evidence.model || deploymentEvidenceModel(),
          evidence: {
            id: evidence.id,
            executionId: evidence.executionId,
            provenance: evidence.provenance,
            state: evidence.state,
          },
          authorization: {
            id: authorization.id,
            planId: authorization.planId,
            state: 'analyzed',
          },
        });
      }

      if (!deploymentEvidenceAiConfigured()) {
        return noStoreJson({
          error: 'Deployment evidence interpretation is not configured on this Oxsig server',
          code: 'AI_NOT_CONFIGURED',
        }, { status: 503 });
      }

      const analysis = await interpretDeploymentEvidence(facts);
      const model = deploymentEvidenceModel();
      const analyzedEvidence = await storeExecutionEvidenceAnalysis({
        ownerId: user.id,
        evidenceId: evidence.id,
        analysisKind: 'deployment',
        analysis: analysis as unknown as Record<string, unknown>,
        model,
      });

      return noStoreJson({
        analysis,
        facts,
        model,
        evidence: {
          id: analyzedEvidence.id,
          executionId: analyzedEvidence.executionId,
          provenance: analyzedEvidence.provenance,
          state: analyzedEvidence.state,
        },
        authorization: {
          id: authorization.id,
          planId: authorization.planId,
          state: 'analyzed',
        },
      });
    } catch (error) {
      if (error instanceof ExecutionEvidenceConflictError || error instanceof DeploymentEvidenceInterpretationError) {
        return noStoreJson({ error: error.message, code: error.code }, { status: 409 });
      }
      console.error('Deployment evidence interpretation failed:', error);
      return noStoreJson({
        error: error instanceof Error ? error.message : 'Deployment evidence interpretation failed',
      }, { status: 502 });
    }
  });
}