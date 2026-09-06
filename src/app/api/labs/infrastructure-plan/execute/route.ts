import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAuth } from '@/lib/auth/middleware';
import { getRequestMetadata } from '@/lib/audit/logger';
import {
  ControlledDeploymentExecutionError,
  executeControlledDeployment,
} from '@/lib/infrastructure/controlled-deployment-executor';
import { getDeploymentAuthorizationById } from '@/lib/infrastructure/deployment-authorization';
import { compileDeploymentPlan, DeploymentPlanCompileError } from '@/lib/infrastructure/deployment-plan-compiler';
import { evaluateDeploymentExecutionSupport } from '@/lib/infrastructure/deployment-execution-support';
import { getDeploymentPlanIdentity } from '@/lib/infrastructure/deployment-plan-identity';
import { getInfrastructureDesign } from '@/lib/infrastructure/designer-persistence';
import { validateCsrfToken } from '@/lib/security/csrf';
import { checkRateLimit, RATE_LIMITS } from '@/lib/security/rate-limit';

export const runtime = 'nodejs';

const executeSchema = z.object({
  authorizationId: z.string().uuid(),
  executionId: z.string().uuid(),
}).strict();

function sameTarget(
  current: ReturnType<typeof evaluateDeploymentExecutionSupport>,
  stored: Awaited<ReturnType<typeof getDeploymentAuthorizationById>>
) {
  if (!stored) return false;
  const previous = stored.executionSupport;
  return (
    current.supported &&
    previous.supported &&
    current.adapter === 'existing-lab-vm' &&
    previous.adapter === 'existing-lab-vm' &&
    current.target?.nodeId === previous.target?.nodeId &&
    current.target?.labSlug === previous.target?.labSlug &&
    current.target?.accessMode === previous.target?.accessMode
  );
}

export async function POST(request: NextRequest) {
  return requireAuth(request, async (req, user) => {
    if (!(await validateCsrfToken(req))) {
      return NextResponse.json({ error: 'Invalid or missing CSRF token' }, { status: 403 });
    }

    const requestLimit = await checkRateLimit(
      req,
      { maxRequests: 20, windowMs: 60_000 },
      user.id
    );
    if (requestLimit) return requestLimit;

    const parsed = executeSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'A valid one-time deployment execution receipt is required' },
        { status: 400, headers: { 'Cache-Control': 'no-store' } }
      );
    }

    const authorization = await getDeploymentAuthorizationById(user.id, parsed.data.authorizationId);
    if (!authorization) {
      return NextResponse.json(
        { error: 'Deployment authorization not found' },
        { status: 404, headers: { 'Cache-Control': 'no-store' } }
      );
    }
    if (authorization.executionId !== parsed.data.executionId) {
      return NextResponse.json(
        { error: 'The execution receipt does not match this authorization' },
        { status: 409, headers: { 'Cache-Control': 'no-store' } }
      );
    }

    const design = await getInfrastructureDesign(user.id);
    if (!design) {
      return NextResponse.json(
        { error: 'The source infrastructure design no longer exists' },
        { status: 409, headers: { 'Cache-Control': 'no-store' } }
      );
    }

    try {
      const currentPlan = compileDeploymentPlan(design.design);
      const currentIdentity = getDeploymentPlanIdentity(currentPlan);
      if (
        currentIdentity.planHash !== authorization.planHash ||
        design.updatedAt !== authorization.sourceDesignUpdatedAt
      ) {
        return NextResponse.json(
          { error: 'The infrastructure design changed after authorization. Generate a new plan and receipt.' },
          { status: 409, headers: { 'Cache-Control': 'no-store' } }
        );
      }

      const currentSupport = evaluateDeploymentExecutionSupport(currentPlan);
      if (!sameTarget(currentSupport, authorization)) {
        return NextResponse.json(
          {
            error: 'The controlled execution adapter no longer matches the reviewed deployment plan.',
            reasons: currentSupport.reasons,
          },
          { status: 409, headers: { 'Cache-Control': 'no-store' } }
        );
      }

      // Charge the shared cloud-launch allowance only when this request can
      // transition a fresh receipt into a new cost-bearing provider action.
      // Idempotent retries of an already-started execution stay request-throttled
      // above, but do not consume another provisioning allowance.
      if (authorization.state === 'receipt_issued') {
        const costLimit = await checkRateLimit(
          req,
          RATE_LIMITS.LAB_PROVISION,
          user.id,
          'lab-provision'
        );
        if (costLimit) return costLimit;
      }

      const executed = await executeControlledDeployment({
        ownerId: user.id,
        distinctId: user.clerkUserId || user.id,
        authorization,
        executionId: parsed.data.executionId,
        auditRequestMetadata: getRequestMetadata(req),
      });

      return NextResponse.json(
        {
          ...executed,
          executionStarted: true,
          message: executed.alreadyStarted
            ? 'This execution receipt was already consumed. Returning the bound lab allocation.'
            : 'Controlled cloud deployment started from the reviewed Infrastructure Designer plan.',
        },
        {
          status: executed.alreadyStarted ? 200 : 201,
          headers: { 'Cache-Control': 'no-store' },
        }
      );
    } catch (error) {
      if (error instanceof DeploymentPlanCompileError) {
        return NextResponse.json(
          { error: 'The infrastructure design is no longer valid. Generate a new deployment plan.' },
          { status: 409, headers: { 'Cache-Control': 'no-store' } }
        );
      }
      if (error instanceof ControlledDeploymentExecutionError) {
        return NextResponse.json(
          {
            error: error.message,
            code: error.code,
            ...(error.instanceId ? { instanceId: error.instanceId } : {}),
          },
          { status: error.status, headers: { 'Cache-Control': 'no-store' } }
        );
      }
      throw error;
    }
  });
}
