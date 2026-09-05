import { describe, expect, it } from 'vitest';
import { infrastructureDesignSchema, type InfrastructureDesign } from './designer-schema';
import { validateInfrastructureDesign } from './designer-validation';

function design(overrides: Partial<InfrastructureDesign> = {}): InfrastructureDesign {
  return {
    version: 1,
    nodes: [
      {
        id: 'client-1',
        type: 'infrastructure',
        position: { x: 100, y: 100 },
        data: {
          kind: 'client',
          label: 'Client 1',
          hostname: 'client-1',
          ipv4: '10.0.0.10',
          cidr: '10.0.0.0/24',
          gateway: '10.0.0.1',
          runtimeProfile: {
            profileId: 'ubuntu-24-04',
            architecture: 'x86_64',
            resourceClass: 'lab-small',
            accessMode: 'terminal',
          },
        },
      },
      {
        id: 'router-1',
        type: 'infrastructure',
        position: { x: 400, y: 100 },
        data: { kind: 'router', label: 'Router 1', hostname: 'router-1', ipv4: '10.0.0.1', cidr: '10.0.0.0/24' },
      },
    ],
    edges: [{ id: 'edge-1', source: 'client-1', target: 'router-1', type: 'smoothstep' }],
    ...overrides,
  };
}

describe('infrastructureDesignSchema', () => {
  it('accepts a bounded technical design with an explicit runtime profile', () => {
    const value = design();
    expect(infrastructureDesignSchema.parse(value)).toEqual(value);
  });

  it('keeps older v1 designs valid when a runtime profile has not been selected yet', () => {
    const value = design();
    delete value.nodes[0].data.runtimeProfile;
    expect(infrastructureDesignSchema.parse(value)).toEqual(value);
  });

  it('rejects links to missing devices', () => {
    const parsed = infrastructureDesignSchema.safeParse(design({
      edges: [{ id: 'broken', source: 'client-1', target: 'missing' }],
    }));
    expect(parsed.success).toBe(false);
  });
});

describe('validateInfrastructureDesign', () => {
  it('accepts a connected design with consistent addressing and a compatible runtime profile', () => {
    const result = validateInfrastructureDesign(design());
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
    expect(result.warnings).toHaveLength(0);
  });

  it('detects duplicate addresses and subnet mismatches', () => {
    const value = design();
    value.nodes[0].data.ipv4 = '10.0.0.1';
    value.nodes[0].data.cidr = '192.168.1.0/24';
    const result = validateInfrastructureDesign(value);
    expect(result.valid).toBe(false);
    expect(result.errors.map((issue) => issue.code)).toContain('duplicate-ipv4');
    expect(result.errors.map((issue) => issue.code)).toContain('ip-outside-cidr');
  });

  it('warns about isolated devices without making the design structurally invalid', () => {
    const result = validateInfrastructureDesign(design({ edges: [] }));
    expect(result.valid).toBe(true);
    expect(result.warnings.filter((issue) => issue.code === 'isolated-node')).toHaveLength(2);
  });

  it('warns when a compute node has no runtime profile', () => {
    const value = design();
    delete value.nodes[0].data.runtimeProfile;
    const result = validateInfrastructureDesign(value);
    expect(result.valid).toBe(true);
    expect(result.warnings.map((issue) => issue.code)).toContain('runtime-profile-missing');
  });

  it('rejects an operating system profile that conflicts with the node kind', () => {
    const value = design();
    value.nodes[0].data.runtimeProfile = {
      profileId: 'windows-server-2022',
      architecture: 'x86_64',
      resourceClass: 'lab-medium',
      accessMode: 'terminal',
    };
    const result = validateInfrastructureDesign(value);
    expect(result.valid).toBe(false);
    expect(result.errors.map((issue) => issue.code)).toContain('runtime-profile-invalid');
  });

  it('warns when a valid profile is mapped but currently unavailable', () => {
    const value = design();
    value.nodes[0].data.runtimeProfile = {
      profileId: 'rocky-linux-9',
      architecture: 'x86_64',
      resourceClass: 'lab-small',
      accessMode: 'terminal',
    };
    const result = validateInfrastructureDesign(value);
    expect(result.valid).toBe(true);
    expect(result.warnings.map((issue) => issue.code)).toContain('runtime-profile-unavailable');
  });

  it('detects self-links', () => {
    const result = validateInfrastructureDesign(design({
      edges: [{ id: 'self', source: 'client-1', target: 'client-1' }],
    }));
    expect(result.valid).toBe(false);
    expect(result.errors.map((issue) => issue.code)).toContain('self-link');
  });
});
