import { describe, expect, it } from 'vitest';
import type { InfrastructureDesign } from './designer-schema';
import { compileDeploymentPlan } from './deployment-plan-compiler';
import { evaluateDeploymentExecutionSupport } from './deployment-execution-support';

function designWith(nodes: InfrastructureDesign['nodes'], edges: InfrastructureDesign['edges'] = []): InfrastructureDesign {
  return { version: 1, nodes, edges };
}

function ubuntuServer(id = 'server-1'): InfrastructureDesign['nodes'][number] {
  return {
    id,
    type: 'infrastructure',
    position: { x: 0, y: 0 },
    data: {
      kind: 'server',
      label: 'Ubuntu Server',
      runtimeProfile: {
        profileId: 'ubuntu-24-04',
        architecture: 'x86_64',
        resourceClass: 'lab-small',
        accessMode: 'terminal',
      },
    },
  };
}

describe('evaluateDeploymentExecutionSupport', () => {
  it('maps one bare supported workload to the existing controlled VM adapter', () => {
    const plan = compileDeploymentPlan(designWith([ubuntuServer()]));

    expect(evaluateDeploymentExecutionSupport(plan)).toEqual({
      supported: true,
      adapter: 'existing-lab-vm',
      reasons: [],
      target: {
        nodeId: 'server-1',
        labSlug: 'ubuntu-security-lab',
        accessMode: 'terminal',
      },
    });
  });

  it('does not silently promise blueprint configuration the adapter cannot apply', () => {
    const server = ubuntuServer();
    server.data.hostname = 'app01.lab.local';
    server.data.role = 'nginx';
    const plan = compileDeploymentPlan(designWith([server]));
    const support = evaluateDeploymentExecutionSupport(plan);

    expect(support.supported).toBe(false);
    expect(support.adapter).toBe('none');
    expect(support.reasons.join(' ')).toContain('hostnames');
    expect(support.reasons.join(' ')).toContain('role/service');
  });

  it('keeps multi-node topology outside the current one-VM execution contract', () => {
    const first = ubuntuServer('server-1');
    const second = ubuntuServer('server-2');
    second.position = { x: 200, y: 0 };
    const plan = compileDeploymentPlan(designWith(
      [first, second],
      [{ id: 'edge-1', source: 'server-1', target: 'server-2' }]
    ));
    const support = evaluateDeploymentExecutionSupport(plan);

    expect(support.supported).toBe(false);
    expect(support.reasons.join(' ')).toContain('exactly one VM workload');
    expect(support.reasons.join(' ')).toContain('explicit topology links');
  });
});
