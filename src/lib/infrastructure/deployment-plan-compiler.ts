import type { InfrastructureDesign } from './designer-schema';
import { validateInfrastructureDesign, type InfrastructureValidationResult } from './designer-validation';
import { deploymentPlanSchema, type DeploymentPlan, type DeploymentPlanAction } from './deployment-plan-schema';

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

export function compileDeploymentPlan(design: InfrastructureDesign): DeploymentPlan {
  const validation = validateInfrastructureDesign(design);
  if (!validation.valid) throw new DeploymentPlanCompileError(validation);

  const workloads = design.nodes
    .filter((node) => node.data.kind === 'client' || node.data.kind === 'server')
    .map((node) => ({
      nodeId: node.id,
      kind: node.data.kind as 'client' | 'server',
      label: node.data.label,
      ...(present(node.data.hostname) ? { hostname: present(node.data.hostname) } : {}),
      ...(present(node.data.ipv4) ? { ipv4: present(node.data.ipv4) } : {}),
      ...(present(node.data.cidr) ? { cidr: present(node.data.cidr) } : {}),
      ...(present(node.data.gateway) ? { gateway: present(node.data.gateway) } : {}),
      ...(present(node.data.role) ? { role: present(node.data.role) } : {}),
      runtime: 'virtual-machine' as const,
      runtimeProfile: 'unspecified' as const,
    }));

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
      blocker: 'Multi-segment network orchestration is not implemented yet.',
    });
  }

  for (const workload of workloads) {
    actions.push({
      id: `compute:${workload.nodeId}`,
      phase: 'compute',
      type: 'provision-workload',
      nodeId: workload.nodeId,
      description: `Provision ${workload.kind} ${descriptionLabel(workload.label, workload.hostname)} as a virtual machine.`,
      executableNow: false,
      blocker: 'Choose an explicit operating-system/runtime profile before provisioning.',
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
      blocker: `No controlled ${networkFunction.kind} execution adapter is registered yet.`,
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
      blocker: 'Topology links are design intent until a network execution adapter is authorized.',
    });
  }

  actions.push({
    id: 'verification:runtime-evidence',
    phase: 'verification',
    type: 'verify-runtime',
    description: 'Verify deployed addressing, reachability, and runtime state and record evidence against the authorized plan.',
    executableNow: false,
    blocker: 'Runtime evidence verification belongs to the later authorized execution stage.',
  });

  const blockers = new Set<string>();
  if (design.nodes.length === 0) blockers.add('The blueprint has no devices to deploy.');
  if (workloads.length > 0) blockers.add(`${workloads.length} compute workload${workloads.length === 1 ? '' : 's'} need an explicit operating-system/runtime profile.`);
  if (networkFunctions.length > 0) blockers.add(`${networkFunctions.length} network function${networkFunctions.length === 1 ? '' : 's'} require controlled execution adapters.`);
  blockers.add('Deployment Planner v1 is proposal-only and cannot modify AWS or live Cyber Lab runtime state.');

  const warnings = new Set(validation.warnings.map((issue) => issue.message));
  for (const workload of workloads) {
    if (!workload.ipv4 || !workload.cidr) {
      warnings.add(`${workload.label} does not fully specify IPv4 addressing; the learner or a future deployment adapter must resolve it explicitly.`);
    }
  }

  const plan: DeploymentPlan = {
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
  };

  return deploymentPlanSchema.parse(plan);
}
