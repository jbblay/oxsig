import type { InfrastructureDesign } from './designer-schema';
import { validateInfrastructureDesign, type InfrastructureValidationResult } from './designer-validation';
import { evaluateDeploymentExecutionSupport } from './deployment-execution-support';
import { deploymentPlanSchema, type DeploymentPlan, type DeploymentPlanAction } from './deployment-plan-schema';
import { getRuntimeProfile, getRuntimeProfileAvailability, type RuntimeProfileSelection } from './runtime-profile';

export class DeploymentPlanCompileError extends Error {
  readonly validation: InfrastructureValidationResult;

  constructor(validation: InfrastructureValidationResult) {
    super('Infrastructure design has blocking validation errors');
    this.name = 'DeploymentPlanCompileError';
    this.validation = validation;
  }
}

function present(value?: string) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

function descriptionLabel(label: string, hostname?: string) {
  return hostname ? `${label} (${hostname})` : label;
}

function runtimeAdapterFor(selection?: RuntimeProfileSelection) {
  if (!selection) {
    return {
      status: 'unmapped' as const,
      note: 'Choose an explicit runtime profile before an execution adapter can be selected.',
    };
  }

  const profile = getRuntimeProfile(selection.profileId);
  if (!profile) {
    return { status: 'unmapped' as const, note: `Runtime profile ${selection.profileId} is not recognized.` };
  }

  const availability = getRuntimeProfileAvailability(profile.id);
  if (!availability.mapped) {
    return {
      status: 'unmapped' as const,
      ...(availability.note ? { note: availability.note } : {}),
    };
  }

  if (!availability.available) {
    return {
      status: 'mapped-unavailable' as const,
      labSlug: availability.labSlug,
      ...(availability.note ? { note: availability.note } : {}),
    };
  }

  return {
    status: 'mapped-available' as const,
    labSlug: availability.labSlug,
  };
}

export function compileDeploymentPlan(design: InfrastructureDesign): DeploymentPlan {
  const validation = validateInfrastructureDesign(design);
  if (!validation.valid) throw new DeploymentPlanCompileError(validation);

  const workloads = design.nodes
    .filter((node) => node.data.kind === 'client' || node.data.kind === 'server')
    .map((node) => {
      const selection = node.data.runtimeProfile;
      const profile = getRuntimeProfile(selection?.profileId);
      return {
        nodeId: node.id,
        kind: node.data.kind as 'client' | 'server',
        label: node.data.label,
        ...(present(node.data.hostname) ? { hostname: present(node.data.hostname) } : {}),
        ...(present(node.data.ipv4) ? { ipv4: present(node.data.ipv4) } : {}),
        ...(present(node.data.cidr) ? { cidr: present(node.data.cidr) } : {}),
        ...(present(node.data.gateway) ? { gateway: present(node.data.gateway) } : {}),
        ...(present(node.data.role) ? { role: present(node.data.role) } : {}),
        runtime: 'virtual-machine' as const,
        runtimeProfile: selection || ('unspecified' as const),
        ...(profile ? { runtimeProfileLabel: profile.label } : {}),
        runtimeAdapter: runtimeAdapterFor(selection),
      };
    });

  const networkFunctions = design.nodes
    .filter((node) => node.data.kind === 'router' || node.data.kind === 'switch' || node.data.kind === 'firewall')
    .map((node) => ({
      nodeId: node.id,
      kind: node.data.kind as 'router' | 'switch' | 'firewall',
      label: node.data.label,
      ...(present(node.data.hostname) ? { hostname: present(node.data.hostname) } : {}),
      ...(present(node.data.ipv4) ? { ipv4: present(node.data.ipv4) } : {}),
      ...(present(node.data.cidr) ? { cidr: present(node.data.cidr) } : {}),
      ...(present(node.data.gateway) ? { gateway: present(node.data.gateway) } : {}),
      ...(present(node.data.role) ? { role: present(node.data.role) } : {}),
      implementation: 'adapter-required' as const,
    }));

  const segmentMembers = new Map<string, { members: string[]; gateways: Set<string> }>();
  for (const node of design.nodes) {
    const cidr = present(node.data.cidr);
    if (!cidr) continue;
    const entry = segmentMembers.get(cidr) || { members: [], gateways: new Set<string>() };
    entry.members.push(node.id);
    const gateway = present(node.data.gateway);
    if (gateway) entry.gateways.add(gateway);
    segmentMembers.set(cidr, entry);
  }

  const segments = [...segmentMembers.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([cidr, entry], index) => ({
      id: `segment-${String(index + 1).padStart(2, '0')}`,
      cidr,
      memberNodeIds: [...entry.members].sort(),
      gatewayCandidates: [...entry.gateways].sort(),
    }));

  const links = design.edges.map((edge) => ({
    edgeId: edge.id,
    source: edge.source,
    target: edge.target,
    ...(present(edge.label) ? { label: present(edge.label) } : {}),
  }));

  const actions: DeploymentPlanAction[] = [];
  for (const segment of segments) {
    actions.push({
      id: `network:${segment.id}`,
      phase: 'network',
      type: 'reserve-segment',
      segmentId: segment.id,
      description: `Prepare network segment ${segment.cidr} for ${segment.memberNodeIds.length} device${segment.memberNodeIds.length === 1 ? '' : 's'}.`,
      executableNow: false,
      blocker: 'The controlled VM adapter does not allocate custom network segments; this segment remains design intent.',
    });
  }

  for (const workload of workloads) {
    let blocker: string;
    if (workload.runtimeProfile === 'unspecified') {
      blocker = 'Choose an explicit operating-system/runtime profile before provisioning.';
    } else if (workload.runtimeAdapter.status === 'mapped-available') {
      blocker = `Runtime profile ${workload.runtimeProfileLabel || workload.runtimeProfile.profileId} is mapped to ${workload.runtimeAdapter.labSlug}; provider execution requires explicit server-side authorization and a one-time execution receipt.`;
    } else {
      blocker = workload.runtimeAdapter.note || 'No controlled runtime adapter is currently available for this profile.';
    }

    actions.push({
      id: `compute:${workload.nodeId}`,
      phase: 'compute',
      type: 'provision-workload',
      nodeId: workload.nodeId,
      description: `Provision ${workload.kind} ${descriptionLabel(workload.label, workload.hostname)} as a virtual machine${workload.runtimeProfileLabel ? ` using ${workload.runtimeProfileLabel}` : ''}.`,
      executableNow: false,
      blocker,
    });
  }

  for (const networkFunction of networkFunctions) {
    actions.push({
      id: `network-function:${networkFunction.nodeId}`,
      phase: 'network-functions',
      type: 'configure-network-function',
      nodeId: networkFunction.nodeId,
      description: `Implement ${networkFunction.kind} ${descriptionLabel(networkFunction.label, networkFunction.hostname)}.`,
      executableNow: false,
      blocker: `The controlled VM adapter does not execute ${networkFunction.kind} nodes; this network function remains design intent.`,
    });
  }

  for (const link of links) {
    actions.push({
      id: `connectivity:${link.edgeId}`,
      phase: 'connectivity',
      type: 'connect-link',
      edgeId: link.edgeId,
      description: `Realize the intended link between ${link.source} and ${link.target}.`,
      executableNow: false,
      blocker: 'The controlled VM adapter does not execute explicit topology links; this link remains design intent.',
    });
  }

  actions.push({
    id: 'verification:runtime-evidence',
    phase: 'verification',
    type: 'verify-runtime',
    description: 'Verify deployed addressing, reachability, and runtime state and record evidence against the authorized plan.',
    executableNow: false,
    blocker: 'Runtime verification begins only after a matching controlled deployment starts and produces bound runtime evidence.',
  });

  const blockers = new Set<string>();
  if (design.nodes.length === 0) blockers.add('The blueprint has no devices to deploy.');

  const missingProfiles = workloads.filter((workload) => workload.runtimeProfile === 'unspecified');
  if (missingProfiles.length > 0) {
    blockers.add(`${missingProfiles.length} compute workload${missingProfiles.length === 1 ? '' : 's'} need an explicit operating-system/runtime profile.`);
  }

  for (const workload of workloads) {
    if (workload.runtimeProfile === 'unspecified') continue;
    if (workload.runtimeAdapter.status !== 'mapped-available') {
      blockers.add(`${workload.label}: ${workload.runtimeAdapter.note || 'No controlled runtime adapter is available.'}`);
    }
  }

  const warnings = new Set(validation.warnings.map((issue) => issue.message));
  for (const workload of workloads) {
    if (!workload.ipv4 || !workload.cidr) {
      warnings.add(`${workload.label} does not fully specify IPv4 addressing. The controlled one-VM adapter uses provider-assigned addressing, while design-only topology intent remains explicit in the blueprint.`);
    }
  }

  const preliminaryPlan = deploymentPlanSchema.parse({
    version: 1,
    sourceDesignVersion: 1,
    summary: {
      devices: design.nodes.length,
      links: design.edges.length,
      workloads: workloads.length,
      networkFunctions: networkFunctions.length,
      segments: segments.length,
    },
    workloads,
    networkFunctions,
    segments,
    links,
    actions,
    readiness: {
      executable: false,
      blockers: [...blockers],
      warnings: [...warnings],
    },
  });

  const executionSupport = evaluateDeploymentExecutionSupport(preliminaryPlan);
  executionSupport.reasons.forEach((reason) => blockers.add(reason));

  return deploymentPlanSchema.parse({
    ...preliminaryPlan,
    readiness: {
      executable: executionSupport.supported && blockers.size === 0,
      blockers: [...blockers],
      warnings: preliminaryPlan.readiness.warnings,
    },
  });
}
