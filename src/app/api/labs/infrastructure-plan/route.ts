import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth/middleware';
import { getInfrastructureDesign } from '@/lib/infrastructure/designer-persistence';
import { compileDeploymentPlan, DeploymentPlanCompileError } from '@/lib/infrastructure/deployment-plan-compiler';
import { evaluateDeploymentExecutionSupport } from '@/lib/infrastructure/deployment-execution-support';
import { getDeploymentPlanIdentity } from '@/lib/infrastructure/deployment-plan-identity';
import { validateCsrfToken } from '@/lib/security/csrf';
import { checkRateLimit } from '@/lib/security/rate-limit';

export const runtime = 'nodejs';

export async function POST(request: NextRequest) {
  return requireAuth(request, async (req, user) => {
    if (!(await validateCsrfToken(req))) {
      return NextResponse.json({ error: 'Invalid or missing CSRF token' }, { status: 403 });
    }

    const rateLimit = await checkRateLimit(req, { maxRequests: 20, windowMs: 60_000 }, user.id);
    if (rateLimit) return rateLimit;

    const state = await getInfrastructureDesign(user.id);
    if (!state) {
      return NextResponse.json({ error: 'Save an infrastructure design before generating a deployment plan' }, { status: 404 });
    }

    try {
      const plan = compileDeploymentPlan(state.design);
      const executionSupport = evaluateDeploymentExecutionSupport(plan);
      const identity = getDeploymentPlanIdentity(plan);
      return NextResponse.json(
        {
          ...identity,
          sourceDesignUpdatedAt: state.updatedAt,
          generatedAt: new Date().toISOString(),
          plan,
          executionSupport,
        },
        { headers: { 'Cache-Control': 'no-store' } }
      );
    } catch (error) {
      if (error instanceof DeploymentPlanCompileError) {
        return NextResponse.json(
          {
            error: 'Fix blocking infrastructure validation errors before generating a deployment plan',
            validation: error.validation,
          },
          { status: 409, headers: { 'Cache-Control': 'no-store' } }
        );
      }
      throw error;
    }
  });
}
