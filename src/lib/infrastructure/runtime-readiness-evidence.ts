import 'server-only';

import { z } from 'zod';
import type { RuntimeReadinessEvidenceRecord } from '@/lib/execution-evidence/runtime-readiness';
import type { LabTerminalDiagnostics } from '@/lib/labs/terminal-observability';
import type { DeploymentAuthorizationRecord } from './deployment-authorization';

const nullableShortString = z.string().max(255).nullable();

export const runtimeReadinessPayloadSchema = z.object({
  version: z.literal(1),
  authorizationId: z.string().uuid(),
  deploymentExecutionId: z.string().uuid(),
  planId: z.string().min(1).max(200),
  planHash: z.string().regex(/^[0-9a-f]{64}$/),
  labInstanceId: z.string().uuid(),
  target: z.object({
    nodeId: z.string().min(1).max(160),
    labSlug: z.string().min(1).max(160),
    accessMode: z.enum(['terminal', 'desktop']),
  }).strict(),
  ec2: z.object({
    provenance: z.literal('provider-attested'),
    provider: z.literal('aws-ec2'),
    region: z.string().min(1).max(64),
    externalId: z.string().min(1).max(255),
    state: z.string().min(1).max(64),
  }).strict(),
  ssm: z.object({
    provenance: z.literal('provider-attested'),
    provider: z.literal('aws-ssm'),
    registered: z.boolean(),
    pingStatus: nullableShortString,
    agentVersion: nullableShortString,
    platformType: nullableShortString,
    platformName: nullableShortString,
    platformVersion: nullableShortString,
  }).strict(),
  oxsig: z.object({
    provenance: z.literal('server-executed'),
    instanceProfileConfigured: z.boolean(),
  }).strict(),
  readiness: z.object({
    computeReady: z.boolean(),
    managementReady: z.boolean(),
    terminalPathReady: z.boolean(),
    requestedAccessReady: z.boolean(),
    desktopServiceAttested: z.literal(false),
    state: z.enum(['ready', 'management-ready', 'not-ready']),
  }).strict(),
  checkedAt: z.string().datetime(),
}).strict();

export type RuntimeReadinessPayload = z.infer<typeof runtimeReadinessPayloadSchema>;

export const runtimeReadinessFactsSchema = runtimeReadinessPayloadSchema.extend({
  provenance: z.literal('server-executed'),
  attestationScope: z.literal('runtime-management-readiness'),
  evidenceId: z.string().uuid(),
  evidenceExecutionId: z.string().uuid(),
  evidenceRecordedAt: z.string().datetime(),
  workload: z.object({
    label: z.string(),
    kind: z.enum(['client', 'server']),
    hostname: z.string().optional(),
    role: z.string().optional(),
    runtimeProfileLabel: z.string().optional(),
  }).strict(),
  limitations: z.array(z.string().min(1).max(700)).min(1).max(8),
}).strict();

export type RuntimeReadinessFacts = z.infer<typeof runtimeReadinessFactsSchema>;

export const runtimeReadinessAnalysisSchema = z.object({
  summary: z.string().min(1).max(1200),
  observations: z.array(z.string().min(1).max(700)).min(1).max(8),
  interpretation: z.string().min(1).max(2400),
  learningPoints: z.array(z.string().min(1).max(700)).min(1).max(6),
  nextStep: z.string().min(1).max(1200),
  limitations: z.array(z.string().min(1).max(700)).min(1).max(8),
}).strict();

export type RuntimeReadinessAnalysis = z.infer<typeof runtimeReadinessAnalysisSchema>;

export class RuntimeReadinessInterpretationError extends Error {
  constructor(message: string, readonly code: string) {
    super(message);
    this.name = 'RuntimeReadinessInterpretationError';
  }
}

function conflict(message: string, code: string): never {
  throw new RuntimeReadinessInterpretationError(message, code);
}

export function buildRuntimeReadinessPayload(input: {
  authorization: DeploymentAuthorizationRecord;
  labInstanceId: string;
  diagnostics: LabTerminalDiagnostics;
  checkedAt?: string;
}): RuntimeReadinessPayload {
  const { authorization, diagnostics, labInstanceId } = input;
  const target = authorization.executionSupport.target;

  if (!authorization.executionId || !authorization.labInstanceId) {
    conflict('Deployment authorization is missing its execution binding.', 'RUNTIME_READINESS_AUTHORIZATION_BINDING_MISSING');
  }
  if (authorization.labInstanceId !== labInstanceId) {
    conflict('Runtime readiness lab does not match the deployment authorization.', 'RUNTIME_READINESS_LAB_MISMATCH');
  }
  if (
    !authorization.executionSupport.supported ||
    authorization.executionSupport.adapter !== 'existing-lab-vm' ||
    !target
  ) {
    conflict('Deployment authorization does not use the controlled lab runtime adapter.', 'RUNTIME_READINESS_ADAPTER_MISMATCH');
  }

  const computeReady = diagnostics.ec2State === 'running';
  const managementReady =
    computeReady &&
    diagnostics.instanceProfileConfigured &&
    diagnostics.ssmRegistered &&
    diagnostics.ssmPingStatus === 'Online';
  const terminalPathReady = managementReady;
  const requestedAccessReady = target.accessMode === 'terminal' && terminalPathReady;
  const state = requestedAccessReady
    ? 'ready'
    : target.accessMode === 'desktop' && managementReady
      ? 'management-ready'
      : 'not-ready';

  return runtimeReadinessPayloadSchema.parse({
    version: 1,
    authorizationId: authorization.id,
    deploymentExecutionId: authorization.executionId,
    planId: authorization.planId,
    planHash: authorization.planHash,
    labInstanceId,
    target,
    ec2: {
      provenance: 'provider-attested',
      provider: 'aws-ec2',
      region: diagnostics.region,
      externalId: diagnostics.instanceId,
      state: diagnostics.ec2State,
    },
    ssm: {
      provenance: 'provider-attested',
      provider: 'aws-ssm',
      registered: diagnostics.ssmRegistered,
      pingStatus: diagnostics.ssmPingStatus,
      agentVersion: diagnostics.ssmAgentVersion,
      platformType: diagnostics.platformType,
      platformName: diagnostics.platformName,
      platformVersion: diagnostics.platformVersion,
    },
    oxsig: {
      provenance: 'server-executed',
      instanceProfileConfigured: diagnostics.instanceProfileConfigured,
    },
    readiness: {
      computeReady,
      managementReady,
      terminalPathReady,
      requestedAccessReady,
      desktopServiceAttested: false,
      state,
    },
    checkedAt: input.checkedAt || new Date().toISOString(),
  });
}

export function buildRuntimeReadinessFacts(input: {
  authorization: DeploymentAuthorizationRecord;
  evidence: RuntimeReadinessEvidenceRecord;
}): RuntimeReadinessFacts {
  const { authorization, evidence } = input;

  if (!authorization.executionId || !authorization.labInstanceId) {
    conflict('Deployment authorization is missing its execution binding.', 'RUNTIME_READINESS_AUTHORIZATION_BINDING_MISSING');
  }
  if (
    evidence.deploymentAuthorizationId !== authorization.id ||
    evidence.labInstanceId !== authorization.labInstanceId
  ) {
    conflict('Runtime readiness evidence does not match its deployment authorization.', 'RUNTIME_READINESS_EVIDENCE_BINDING_MISMATCH');
  }

  const parsed = runtimeReadinessPayloadSchema.safeParse(evidence.payload);
  if (!parsed.success) {
    conflict('Runtime readiness evidence has an invalid payload contract.', 'RUNTIME_READINESS_PAYLOAD_INVALID');
  }
  const payload = parsed.data;

  if (
    payload.authorizationId !== authorization.id ||
    payload.deploymentExecutionId !== authorization.executionId ||
    payload.labInstanceId !== authorization.labInstanceId ||
    payload.planId !== authorization.planId ||
    payload.planHash !== authorization.planHash
  ) {
    conflict('Runtime readiness evidence identity does not match the exact authorized plan.', 'RUNTIME_READINESS_PLAN_MISMATCH');
  }

  const target = authorization.executionSupport.target;
  if (!target || !authorization.executionSupport.supported || authorization.executionSupport.adapter !== 'existing-lab-vm') {
    conflict('Runtime readiness authorization no longer describes the controlled runtime adapter.', 'RUNTIME_READINESS_TARGET_MISSING');
  }
  if (
    payload.target.nodeId !== target.nodeId ||
    payload.target.labSlug !== target.labSlug ||
    payload.target.accessMode !== target.accessMode
  ) {
    conflict('Runtime readiness evidence target does not match the authorized target.', 'RUNTIME_READINESS_TARGET_MISMATCH');
  }

  const workload = authorization.planSnapshot.workloads.find((candidate) => candidate.nodeId === target.nodeId);
  if (!workload) {
    conflict('Runtime readiness evidence references a workload missing from the authorized plan.', 'RUNTIME_READINESS_WORKLOAD_MISSING');
  }

  const limitations = [
    'EC2 state and SSM registration/ping are provider-attested control-plane observations; OXSIG assembles them into this server-executed readiness record.',
    'SSM Online proves the management agent is reachable through Systems Manager, not that every guest service or application is healthy.',
    'Terminal-path readiness is a precondition for opening an OXSIG terminal; it does not prove that any particular learner command will succeed.',
    payload.target.accessMode === 'desktop'
      ? 'Desktop service readiness is not attested by this check. A separate guest-service observation is still required before claiming the browser desktop is ready.'
      : 'This check does not attest arbitrary application ports, service health, or east-west network connectivity.',
    'Multi-node reachability and application health require separate runtime evidence.',
  ];

  return runtimeReadinessFactsSchema.parse({
    ...payload,
    provenance: 'server-executed',
    attestationScope: 'runtime-management-readiness',
    evidenceId: evidence.id,
    evidenceExecutionId: evidence.executionId,
    evidenceRecordedAt: evidence.evidenceRecordedAt,
    workload: {
      label: workload.label,
      kind: workload.kind,
      ...(workload.hostname ? { hostname: workload.hostname } : {}),
      ...(workload.role ? { role: workload.role } : {}),
      ...(workload.runtimeProfileLabel ? { runtimeProfileLabel: workload.runtimeProfileLabel } : {}),
    },
    limitations,
  });
}

export function runtimeReadinessAiConfigured() {
  return Boolean(process.env.OPENAI_API_KEY);
}

export function runtimeReadinessModel() {
  return process.env.OXSIG_AI_MODEL?.trim() || 'gpt-5.4-mini';
}

function extractResponseText(payload: any): string {
  if (typeof payload?.output_text === 'string' && payload.output_text.trim()) return payload.output_text.trim();
  const chunks: string[] = [];
  for (const item of payload?.output || []) {
    for (const content of item?.content || []) {
      if (typeof content?.text === 'string') chunks.push(content.text);
    }
  }
  return chunks.join('\n').trim();
}

const RUNTIME_READINESS_ANALYSIS_JSON_SCHEMA = {
  type: 'object',
  properties: {
    summary: { type: 'string' },
    observations: { type: 'array', items: { type: 'string' }, minItems: 1, maxItems: 8 },
    interpretation: { type: 'string' },
    learningPoints: { type: 'array', items: { type: 'string' }, minItems: 1, maxItems: 6 },
    nextStep: { type: 'string' },
    limitations: { type: 'array', items: { type: 'string' }, minItems: 1, maxItems: 8 },
  },
  required: ['summary', 'observations', 'interpretation', 'learningPoints', 'nextStep', 'limitations'],
  additionalProperties: false,
};

export async function interpretRuntimeReadinessEvidence(facts: RuntimeReadinessFacts): Promise<RuntimeReadinessAnalysis> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error('Runtime readiness interpretation is not configured. Set OPENAI_API_KEY on the OXSIG server.');

  const instructions = `You are OXSIG explaining runtime readiness evidence to a technical learner.

The supplied facts were assembled server-side from an exact authorized deployment binding. EC2 state and SSM registration/ping are provider-attested subfacts. Treat the deterministic readiness booleans and state as authoritative; your job is to explain them, not recalculate or override them.

Critical constraints:
- Separate direct observations from interpretation.
- If requested access is terminal and requestedAccessReady is true, you may say the OXSIG management/terminal path is ready to attempt a terminal session. Do not claim arbitrary commands or services are healthy.
- If requested access is desktop, never claim the desktop is ready from SSM Online alone. desktopServiceAttested is false in this v1 contract.
- Never invent IP addresses, ports, credentials, service state, application health, or network reachability.
- Explain the distinction between EC2 running, SSM Online, access-path readiness, and application/service readiness.
- Carry forward the supplied limitations.
- The next step should gather the next missing evidence rather than assume it.`;

  const response = await fetch('https://api.openai.com/v1/responses', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: runtimeReadinessModel(),
      store: false,
      instructions,
      input: `SERVER-VERIFIED RUNTIME READINESS FACTS\n${JSON.stringify(facts, null, 2)}`,
      max_output_tokens: 1700,
      text: {
        format: {
          type: 'json_schema',
          name: 'oxsig_runtime_readiness_analysis',
          strict: true,
          schema: RUNTIME_READINESS_ANALYSIS_JSON_SCHEMA,
        },
      },
    }),
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = payload?.error?.message || `AI provider request failed (${response.status})`;
    throw new Error(String(message).slice(0, 500));
  }

  const text = extractResponseText(payload);
  if (!text) throw new Error('AI provider returned no usable runtime readiness analysis');
  return runtimeReadinessAnalysisSchema.parse(JSON.parse(text));
}
