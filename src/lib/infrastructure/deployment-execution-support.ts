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
    reasons.push('The current Cyber Lab runtime can execute exactly one VM workload per account.');
  }
  if (plan.networkFunctions.length > 0) {
    reasons.push('Router, switch, and firewall execution adapters are not implemented yet.');
  }
  if (plan.links.length > 0) {
    reasons.push('Topology link orchestration is not implemented yet.');
  }
  if (plan.segments.length > 0) {
    reasons.push('Custom network-segment orchestration is not implemented yet.');
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

  if (workload.hostname) reasons.push('The current VM adapter does not apply a blueprint hostname yet.');
  if (workload.role) reasons.push('The current VM adapter does not apply role/service configuration yet.');
  if (workload.ipv4 || workload.cidr || workload.gateway) {
    reasons.push('The current VM adapter does not apply blueprint static-network addressing yet.');
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
