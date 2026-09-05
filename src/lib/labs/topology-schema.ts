import { z } from 'zod';

const nodeSchema = z.object({
  id: z.string().min(1).max(160),
  type: z.literal('machine').optional(),
  position: z.object({
    x: z.number().finite().min(-100000).max(100000),
    y: z.number().finite().min(-100000).max(100000),
  }).strict(),
  data: z.object({
    slug: z.string().min(1).max(120),
    label: z.string().min(1).max(160),
  }).strict(),
}).strict();

const edgeSchema = z.object({
  id: z.string().min(1).max(200),
  source: z.string().min(1).max(160),
  target: z.string().min(1).max(160),
  sourceHandle: z.string().max(160).nullable().optional(),
  targetHandle: z.string().max(160).nullable().optional(),
  type: z.string().max(64).optional(),
  animated: z.boolean().optional(),
}).strip();

export const labTopologySchema = z.object({
  nodes: z.array(nodeSchema).max(64),
  edges: z.array(edgeSchema).max(256),
}).strict().superRefine((topology, ctx) => {
  const nodeIds = new Set<string>();
  for (let index = 0; index < topology.nodes.length; index += 1) {
    const id = topology.nodes[index].id;
    if (nodeIds.has(id)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['nodes', index, 'id'],
        message: 'Topology node ids must be unique',
      });
    }
    nodeIds.add(id);
  }

  const edgeIds = new Set<string>();
  for (let index = 0; index < topology.edges.length; index += 1) {
    const edge = topology.edges[index];
    if (edgeIds.has(edge.id)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['edges', index, 'id'],
        message: 'Topology edge ids must be unique',
      });
    }
    edgeIds.add(edge.id);

    if (!nodeIds.has(edge.source) || !nodeIds.has(edge.target)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['edges', index],
        message: 'Topology edges must reference existing nodes',
      });
    }
  }
});

export type LabTopology = z.infer<typeof labTopologySchema>;

export const EMPTY_LAB_TOPOLOGY: LabTopology = { nodes: [], edges: [] };
