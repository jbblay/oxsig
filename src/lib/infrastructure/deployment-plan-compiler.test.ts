import { describe, expect, it } from 'vitest';
import type { InfrastructureDesign } from './designer-schema';
import { compileDeploymentPlan, DeploymentPlanCompileError } from './deployment-plan-compiler';

function design(overrides: Partial<InfrastructureDesign> = {}): InfrastructureDesign {
  return {
    version: 1,
    nodes: [
      {
        id: 'client-1',
        type: 'infrastructure',
        position: { x: 0, y: 0 },
        data: {
          kind: 'client',
          label: 'Client-01',
          hostname: 'client01.lab.local',
          ipv4: '10.10.10.10',
          cidr: '10.10.10.0/24',
          gateway: '10.10.10.1',
        },
      },
      {
        id: 'server-1',
        type: 'infrastructure',
        position: { x: 300, y: 0 },
        data: {
          kind: 'server',
          label: 'Server-01',
          hostname: 'dc01.lab.local',
          ipv4: '10.10.10.20',
          cidr: '10.10.10.0/24',
          gateway: '10.10.10.1',
          role: 'AD DS + DNS',
        },
      },
      {
        id: 'switch-1',
        type: 'infrastructure',
        position: { x: 150, y: 180 },
        data: { kind: 'switch', label: 'Switch-01', cidr: '10.10.10.0/24' },
      },
    ],
    edges: [
      { id: 'edge-1', source: 'client-1', target: 'switch-1' },
      { id: 'edge-2', source: 'server-1', target: 'switch-1' },
    ],
    ...overrides,
  };
}

describe('compileDeploymentPlan', () => {
  it('turns a valid blueprint into a deterministic proposal without executing it', () => {
    const first = compileDeploymentPlan(design());
    const second = compileDeploymentPlan(design());

    expect(first).toEqual(second);
    expect(first.summary).toEqual({
      devices: 3,
      links: 2,
      workloads: 2,
      networkFunctions: 1,
      segments: 1,
    });
    expect(first.segments).toEqual([
      {
        id: 'segment-01',
        cidr: '10.10.10.0/24',
        memberNodeIds: ['client-1', 'server-1', 'switch-1'],
        gatewayCandidates: ['10.10.10.1'],
      },
    ]);
    expect(first.workloads[1]).toMatchObject({
      nodeId: 'server-1',
      role: 'AD DS + DNS',
      runtime: 'virtual-machine',
      runtimeProfile: 'unspecified',
    });
    expect(first.networkFunctions[0]).toMatchObject({
      nodeId: 'switch-1',
      implementation: 'adapter-required',
    });
    expect(first.readiness.executable).toBe(false);
    expect(first.readiness.blockers.join(' ')).toContain('operating-system/runtime profile');
    expect(first.readiness.blockers.join(' ')).toContain('proposal-only');
    expect(first.actions.every((action) => action.executableNow === false)).toBe(true);
  });

  it('refuses to compile a blueprint with blocking validation errors', () => {
    const invalid = design({
      nodes: design().nodes.map((node) => node.id === 'server-1'
        ? { ...node, data: { ...node.data, ipv4: '10.10.10.10' } }
        : node),
    });

    expect(() => compileDeploymentPlan(invalid)).toThrow(DeploymentPlanCompileError);
    try {
      compileDeploymentPlan(invalid);
    } catch (error) {
      const compileError = error as DeploymentPlanCompileError;
      expect(compileError.validation.errors.some((issue) => issue.code === 'duplicate-ipv4')).toBe(true);
    }
  });

  it('surfaces incomplete addressing as a warning instead of inventing values', () => {
    const incomplete = design({
      nodes: design().nodes.map((node) => node.id === 'client-1'
        ? { ...node, data: { kind: 'client' as const, label: 'Client-01' } }
        : node),
    });

    const plan = compileDeploymentPlan(incomplete);
    expect(plan.workloads[0]).not.toHaveProperty('ipv4');
    expect(plan.readiness.warnings.some((warning) => warning.includes('does not fully specify IPv4 addressing'))).toBe(true);
  });
});
