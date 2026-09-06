import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAuth } from '@/lib/auth/middleware';
import {
  createDeploymentAuthorization,
  DeploymentAuthorizationConflictError,
} from '@/lib/infrastructure/deployment-authorization';
import { compileDeploymentPlan, DeploymentPlanCompileError } from '@/lib/infrastructure/deployment-plan-compiler';
import { evaluateDeploymentExecutionSupport } from '@/lib/infrastructure/deployment-execution-support';
import { getDeploymentPlanIdentity } from '@/lib/infrastructure/deployment-plan-identity';
import { getInfrastructureDesign } from '@/lib/infrastructure/designer-persistence';
import { validateCsrfToken } from '@/lib/security/csrf';
import { checkRateLimit } from '@/lib/security/rate-limit';

export const runtime = 'nodejs';

const authorizeSchema = z.object({
  planHash: z.string().regex(/^[0-9a-f]{64}$/),
  confirm: z.literal(true),
}).strict();

export async function POST(request: NextRequest) {
  return requireAuth(request, async (req, user) => {
    if (!(await validateCsrfToken(req))) {
      return NextResponse.json({ error: 'Invalid or missing CSRF token' }, { status: 403 });
    }

    const rateLimit = await checkRateLimit(req, { maxRequests: 8, windowMs: 60_000 }, user.id);
    if (rateLimit) return rateLimit;

    const parsed = authorizeSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Explicit confirmation of a valid deployment plan hash is required' },
        { status: 400, headers: { 'Cache-Control': 'no-store' } }
      );
    }

    const state = await getInfrastructureDesign(user.id);
    if (!state) {
      return NextResponse.json(
        { error: 'Save an infrastructure design before authorizing deployment' },
        { status: 404, headers: { 'Cache-Control': 'no-store' } }
      );
    }

    try {
      const plan = compileDeploymentPlan(state.design);
      const identity = getDeploymentPlanIdentity(plan);
      if (identity.planHash !== parsed.data.planHash) {
        return NextResponse.json(
          { error: 'The deployment plan changed. Regenerate and review the latest plan before authorizing it.' },
          { status: 409, headers: { 'Cache-Control': 'no-store' } }
        );
      }

      const executionSupport = evaluateDeploymentExecutionSupport(plan);
      if (!executionSupport.supported) {
        return NextResponse.json(
          {
            error: 'This deployment plan is outside the current controlled execution adapter scope.',
            reasons: executionSupport.reasons,
          },
          { status: 409, headers: { 'Cache-Control': 'no-store' } }
        );
      }

      const authorization = await createDeploymentAuthorization({
        ownerId: user.id,
        planId: identity.planId,
        planHash: identity.planHash,
        plan,
        sourceDesignUpdatedAt: state.updatedAt,
        executionSupport,
      });

      return NextResponse.json(
        {
          authorization: {
            id: authorization.id,
            planId: authorization.planId,
            planHash: authorization.planHash,
            state: authorization.state,
            expiresAt: authorization.expiresAt,
            executionSupport: authorization.executionSupport,
          },
        },
        { status: 201, headers: { 'Cache-Control': 'no-store' } }
      );
    } catch (error) {
      if (error instanceof DeploymentPlanCompileError) {
        return NextResponse.json(
          {
            error: 'Fix blocking infrastructure validation errors before authorizing deployment',
            validation: error.validation,
          },
          { status: 409, headers: { 'Cache-Control': 'no-store' } }
        );
      }
      if (error instanceof DeploymentAuthorizationConflictError) {
        return NextResponse.json(
          { error: error.message },
          { status: 409, headers: { 'Cache-Control': 'no-store' } }
        );
      }
      throw error;
    }
  });
}
