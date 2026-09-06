import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAuth } from '@/lib/auth/middleware';
import {
  claimDeploymentExecutionReceipt,
  DeploymentAuthorizationConflictError,
  getDeploymentAuthorizationById,
} from '@/lib/infrastructure/deployment-authorization';
import { compileDeploymentPlan, DeploymentPlanCompileError } from '@/lib/infrastructure/deployment-plan-compiler';
import { getDeploymentPlanIdentity } from '@/lib/infrastructure/deployment-plan-identity';
import { getInfrastructureDesign } from '@/lib/infrastructure/designer-persistence';
import { validateCsrfToken } from '@/lib/security/csrf';
import { checkRateLimit } from '@/lib/security/rate-limit';

export const runtime = 'nodejs';

const receiptSchema = z.object({
  authorizationId: z.string().uuid(),
}).strict();

export async function POST(request: NextRequest) {
  return requireAuth(request, async (req, user) => {
    if (!(await validateCsrfToken(req))) {
      return NextResponse.json({ error: 'Invalid or missing CSRF token' }, { status: 403 });
    }

    const rateLimit = await checkRateLimit(req, { maxRequests: 6, windowMs: 60_000 }, user.id);
    if (rateLimit) return rateLimit;

    const parsed = receiptSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'A valid deployment authorization id is required' },
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

    const state = await getInfrastructureDesign(user.id);
    if (!state) {
      return NextResponse.json(
        { error: 'The source infrastructure design no longer exists' },
        { status: 409, headers: { 'Cache-Control': 'no-store' } }
      );
    }

    try {
      const currentPlan = compileDeploymentPlan(state.design);
      const currentIdentity = getDeploymentPlanIdentity(currentPlan);
      if (
        currentIdentity.planHash !== authorization.planHash ||
        state.updatedAt !== authorization.sourceDesignUpdatedAt
      ) {
        return NextResponse.json(
          { error: 'The infrastructure design changed after authorization. Regenerate and authorize the latest plan.' },
          { status: 409, headers: { 'Cache-Control': 'no-store' } }
        );
      }

      const receipt = await claimDeploymentExecutionReceipt(user.id, authorization.id);
      return NextResponse.json(
        {
          receipt,
          executionStarted: false,
          message: 'The one-time execution receipt is reserved. No infrastructure has been created or changed.',
        },
        { status: 201, headers: { 'Cache-Control': 'no-store' } }
      );
    } catch (error) {
      if (error instanceof DeploymentPlanCompileError) {
        return NextResponse.json(
          { error: 'The infrastructure design is no longer valid. Regenerate the deployment plan.' },
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
