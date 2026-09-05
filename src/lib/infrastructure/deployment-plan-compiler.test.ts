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
          runtimeProfile: {
            profileId: 'ubuntu-24-04',
            architecture: 'x86_64',
            resourceClass: 'lab-small',
            accessMode: 'terminal',
          },
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
          runtimeProfile: {
            profileId: 'windows-server-2022',
            architecture: 'x86_64',
            resourceClass: 'lab-medium',
            accessMode: 'terminal',
          },
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
      runtimeProfile: {
        profileId: 'windows-server-2022',
        architecture: 'x86_64',
        resourceClass: 'lab-medium',
        accessMode: 'terminal',
      },
      runtimeProfileLabel: 'Windows Server 2022',
      runtimeAdapter: {
        status: 'mapped-available',
        labSlug: 'windows-server-security-lab',
      },
    });
    expect(first.networkFunctions[0]).toMatchObject({
      nodeId: 'switch-1',
      implementation: 'adapter-required',
    });
    expect(first.readiness.executable).toBe(false);
    expect(first.readiness.blockers.join(' ')).not.toContain('need an explicit operating-system/runtime profile');
    expect(first.readiness.blockers.join(' ')).toContain('proposal-only');
    expect(first.actions.every((action) => action.executableNow === false)).toBe(true);
  });

  it('keeps a missing runtime profile explicit instead of inferring an operating system', () => {
    const value = design();
    delete value.nodes[0].data.runtimeProfile;
    const plan = compileDeploymentPlan(value);
    expect(plan.workloads[0].runtimeProfile).toBe('unspecified');
    expect(plan.workloads[0].runtimeAdapter.status).toBe('unmapped');
    expect(plan.readiness.blockers.join(' ')).toContain('need an explicit operating-system/runtime profile');
  });

  it('carries current catalog unavailability into the plan without erasing learner intent', () => {
    const value = design();
    value.nodes[0].data.runtimeProfile = {
      profileId: 'rocky-linux-9',
      architecture: 'x86_64',
      resourceClass: 'lab-small',
      accessMode: 'terminal',
    };
    const plan = compileDeploymentPlan(value);
    expect(plan.workloads[0].runtimeProfile).toMatchObject({ profileId: 'rocky-linux-9' });
    expect(plan.workloads[0].runtimeAdapter).toMatchObject({
      status: 'mapped-unavailable',
      labSlug: 'rocky-linux-rhcsa-lab',
    });
    expect(plan.readiness.blockers.join(' ')).toContain('Marketplace activation');
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
        ? {
            ...node,
            data: {
              kind: 'client' as const,
              label: 'Client-01',
              runtimeProfile: {
                profileId: 'ubuntu-24-04',
                architecture: 'x86_64' as const,
                resourceClass: 'lab-small' as const,
                accessMode: 'terminal' as const,
              },
            },
          }
        : node),
    });

    const plan = compileDeploymentPlan(incomplete);
    expect(plan.workloads[0]).not.toHaveProperty('ipv4');
    expect(plan.readiness.warnings.some((warning) => warning.includes('does not fully specify IPv4 addressing'))).toBe(true);
  });
});
