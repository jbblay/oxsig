import { createHash } from 'node:crypto';
import type { DeploymentPlan } from './deployment-plan-schema';

export type DeploymentPlanIdentity = {
  planId: string;
  planHash: string;
};

export function getDeploymentPlanIdentity(plan: DeploymentPlan): DeploymentPlanIdentity {
  const planHash = createHash('sha256').update(JSON.stringify(plan)).digest('hex');
  return {
    planId: `plan_${planHash.slice(0, 24)}`,
    planHash,
  };
}
