import type { DeploymentPlan } from './deployment-plan-schema';
import { getRuntimeProfile } from './runtime-profile';

export type DeploymentExecutionSupport = {
  supported: boolean;
  adapter: 'existing-lab-vm' | 'none';
  reasons: string[];
  target?: {
    nodeId: string;
    labSlug: string;
    accessMode: 'terminal' | 'desktop';
  };
};

export function evaluateDeploymentExecutionSupport(plan: DeploymentPlan): DeploymentExecutionSupport {
  const reasons: string[] = [];

  if (plan.workloads.length !== 1) {
    reasons.push('The controlled deployment adapter accepts exactly one VM workload per execution receipt.');
  }
  if (plan.networkFunctions.length > 0) {
    reasons.push('The controlled deployment adapter does not execute router, switch, or firewall nodes.');
  }
  if (plan.links.length > 0) {
    reasons.push('The controlled deployment adapter does not execute explicit topology links.');
  }
  if (plan.segments.length > 0) {
    reasons.push('The controlled deployment adapter does not allocate custom network segments.');
  }

  const workload = plan.workloads[0];
  if (!workload) return { supported: false, adapter: 'none', reasons };

  if (workload.runtimeProfile === 'unspecified') {
    reasons.push('The workload needs an explicit runtime profile.');
    return { supported: false, adapter: 'none', reasons };
  }

  const profile = getRuntimeProfile(workload.runtimeProfile.profileId);
  if (!profile) {
    reasons.push('The selected runtime profile is no longer recognized.');
    return { supported: false, adapter: 'none', reasons };
  }

  if (workload.runtimeAdapter.status !== 'mapped-available' || !workload.runtimeAdapter.labSlug) {
    reasons.push(workload.runtimeAdapter.note || 'No currently available controlled runtime adapter is mapped to this profile.');
  }

  if (workload.runtimeProfile.resourceClass !== profile.recommendedResourceClass) {
    reasons.push(`The current ${profile.label} adapter only guarantees the ${profile.recommendedResourceClass} resource class.`);
  }

  if (workload.hostname) reasons.push('The controlled VM adapter does not apply blueprint hostnames.');
  if (workload.role) reasons.push('The controlled VM adapter does not apply role/service configuration.');
  if (workload.ipv4 || workload.cidr || workload.gateway) {
    reasons.push('The controlled VM adapter uses its configured provider network and does not apply blueprint static-network addressing.');
  }

  if (reasons.length > 0 || !workload.runtimeAdapter.labSlug) {
    return { supported: false, adapter: 'none', reasons };
  }

  return {
    supported: true,
    adapter: 'existing-lab-vm',
    reasons: [],
    target: {
      nodeId: workload.nodeId,
      labSlug: workload.runtimeAdapter.labSlug,
      accessMode: workload.runtimeProfile.accessMode,
    },
  };
}
