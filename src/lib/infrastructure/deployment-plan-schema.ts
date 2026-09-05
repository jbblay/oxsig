import { z } from 'zod';

const workloadSchema = z.object({
  nodeId: z.string().min(1).max(160),
  kind: z.enum(['client', 'server']),
  label: z.string().min(1).max(160),
  hostname: z.string().max(253).optional(),
  ipv4: z.string().max(64).optional(),
  cidr: z.string().max(64).optional(),
  gateway: z.string().max(64).optional(),
  role: z.string().max(240).optional(),
  runtime: z.literal('virtual-machine'),
  runtimeProfile: z.literal('unspecified'),
}).strict();

const networkFunctionSchema = z.object({
  nodeId: z.string().min(1).max(160),
  kind: z.enum(['router', 'switch', 'firewall']),
  label: z.string().min(1).max(160),
  hostname: z.string().max(253).optional(),
  ipv4: z.string().max(64).optional(),
  cidr: z.string().max(64).optional(),
  gateway: z.string().max(64).optional(),
  role: z.string().max(240).optional(),
  implementation: z.literal('adapter-required'),
}).strict();

const segmentSchema = z.object({
  id: z.string().min(1).max(200),
  cidr: z.string().min(1).max(64),
  memberNodeIds: z.array(z.string().min(1).max(160)).max(80),
  gatewayCandidates: z.array(z.string().min(1).max(64)).max(80),
}).strict();

const linkSchema = z.object({
  edgeId: z.string().min(1).max(200),
  source: z.string().min(1).max(160),
  target: z.string().min(1).max(160),
  label: z.string().max(160).optional(),
}).strict();

const actionSchema = z.object({
  id: z.string().min(1).max(240),
  phase: z.enum(['network', 'compute', 'network-functions', 'connectivity', 'verification']),
  type: z.enum(['reserve-segment', 'provision-workload', 'configure-network-function', 'connect-link', 'verify-runtime']),
  description: z.string().min(1).max(500),
  executableNow: z.boolean(),
  blocker: z.string().max(500).optional(),
  nodeId: z.string().max(160).optional(),
  edgeId: z.string().max(200).optional(),
  segmentId: z.string().max(200).optional(),
}).strict();

export const deploymentPlanSchema = z.object({
  version: z.literal(1),
  sourceDesignVersion: z.literal(1),
  summary: z.object({
    devices: z.number().int().min(0).max(80),
    links: z.number().int().min(0).max(256),
    workloads: z.number().int().min(0).max(80),
    networkFunctions: z.number().int().min(0).max(80),
    segments: z.number().int().min(0).max(80),
  }).strict(),
  workloads: z.array(workloadSchema).max(80),
  networkFunctions: z.array(networkFunctionSchema).max(80),
  segments: z.array(segmentSchema).max(80),
  links: z.array(linkSchema).max(256),
  actions: z.array(actionSchema).max(600),
  readiness: z.object({
    executable: z.boolean(),
    blockers: z.array(z.string().min(1).max(500)).max(100),
    warnings: z.array(z.string().min(1).max(500)).max(100),
  }).strict(),
}).strict();

export type DeploymentPlan = z.infer<typeof deploymentPlanSchema>;
export type DeploymentPlanAction = DeploymentPlan['actions'][number];
