import { describe, expect, it } from 'vitest';
import { labTopologySchema } from './topology-schema';

const validTopology = {
  nodes: [
    { id: 'machine-a', type: 'machine', position: { x: 100, y: 120 }, data: { slug: 'ubuntu', label: 'Ubuntu-01' } },
    { id: 'machine-b', type: 'machine', position: { x: 420, y: 120 }, data: { slug: 'kali', label: 'Kali-01' } },
  ],
  edges: [
    { id: 'edge-a-b', source: 'machine-a', target: 'machine-b', type: 'smoothstep', animated: true },
  ],
};

describe('labTopologySchema', () => {
  it('accepts a bounded machine topology', () => {
    expect(labTopologySchema.parse(validTopology)).toEqual(validTopology);
  });

  it('rejects edges that reference missing nodes', () => {
    const parsed = labTopologySchema.safeParse({
      ...validTopology,
      edges: [{ id: 'broken', source: 'machine-a', target: 'missing' }],
    });
    expect(parsed.success).toBe(false);
  });

  it('rejects duplicate node ids', () => {
    const parsed = labTopologySchema.safeParse({
      nodes: [validTopology.nodes[0], { ...validTopology.nodes[1], id: 'machine-a' }],
      edges: [],
    });
    expect(parsed.success).toBe(false);
  });
});
