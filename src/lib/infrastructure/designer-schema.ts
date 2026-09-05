import { z } from 'zod';
import { runtimeProfileSelectionSchema } from './runtime-profile';

export const INFRASTRUCTURE_KINDS = ['client', 'server', 'router', 'switch', 'firewall'] as const;
export type InfrastructureKind = (typeof INFRASTRUCTURE_KINDS)[number];

const positionSchema = z.object({
  x: z.number().finite().min(-100000).max(100000),
  y: z.number().finite().min(-100000).max(100000),
}).strict();

const deviceDataSchema = z.object({
  kind: z.enum(INFRASTRUCTURE_KINDS),
  label: z.string().trim().min(1).max(160),
  hostname: z.string().trim().max(253).optional(),
  ipv4: z.string().trim().max(64).optional(),
  cidr: z.string().trim().max(64).optional(),
  gateway: z.string().trim().max(64).optional(),
  role: z.string().trim().max(240).optional(),
  runtimeProfile: runtimeProfileSelectionSchema.optional(),
}).strict();

const deviceNodeSchema = z.object({
  id: z.string().min(1).max(160),
  type: z.literal('infrastructure'),
  position: positionSchema,
  data: deviceDataSchema,
}).strict();

const linkSchema = z.object({
  id: z.string().min(1).max(200),
  source: z.string().min(1).max(160),
  target: z.string().min(1).max(160),
  sourceHandle: z.string().max(160).nullable().optional(),
  targetHandle: z.string().max(160).nullable().optional(),
  type: z.string().max(64).optional(),
  animated: z.boolean().optional(),
  label: z.string().max(160).optional(),
}).strip();

export const infrastructureDesignSchema = z.object({
  version: z.literal(1),
  nodes: z.array(deviceNodeSchema).max(80),
  edges: z.array(linkSchema).max(256),
}).strict().superRefine((design, ctx) => {
  const nodeIds = new Set<string>();
  for (let index = 0; index < design.nodes.length; index += 1) {
    const id = design.nodes[index].id;
    if (nodeIds.has(id)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['nodes', index, 'id'],
        message: 'Infrastructure node ids must be unique',
      });
    }
    nodeIds.add(id);
  }

  const edgeIds = new Set<string>();
  for (let index = 0; index < design.edges.length; index += 1) {
    const edge = design.edges[index];
    if (edgeIds.has(edge.id)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['edges', index, 'id'],
        message: 'Infrastructure link ids must be unique',
      });
    }
    edgeIds.add(edge.id);

    if (!nodeIds.has(edge.source) || !nodeIds.has(edge.target)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['edges', index],
        message: 'Infrastructure links must reference existing nodes',
      });
    }
  }
});

export type InfrastructureDesign = z.infer<typeof infrastructureDesignSchema>;
export type InfrastructureDesignNode = InfrastructureDesign['nodes'][number];
export type InfrastructureDesignEdge = InfrastructureDesign['edges'][number];

export const EMPTY_INFRASTRUCTURE_DESIGN: InfrastructureDesign = {
  version: 1,
  nodes: [],
  edges: [],
};
