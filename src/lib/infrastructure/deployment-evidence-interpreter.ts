import 'server-only';

import { z } from 'zod';
import type { ExecutionEvidenceRecord } from '@/lib/execution-evidence/server';
import type { DeploymentAuthorizationRecord } from './deployment-authorization';

const deploymentEvidencePayloadSchema = z.object({
  authorizationId: z.string().uuid(),
  executionId: z.string().uuid(),
  planId: z.string().min(1).max(200),
  planHash: z.string().regex(/^[0-9a-f]{64}$/),
  provider: z.literal('aws-ec2'),
  externalId: z.string().min(1).max(255),
  nodeId: z.string().min(1).max(160),
  labSlug: z.string().min(1).max(160),
  accessMode: z.enum(['terminal', 'desktop']),
  labEventId: z.string().uuid(),
}).strict();

export const deploymentEvidenceFactsSchema = z.object({
  provenance: z.literal('provider-attested'),
  attestationScope: z.literal('provider-allocation'),
  provider: z.literal('aws-ec2'),
  externalId: z.string(),
  labEventId: z.string().uuid(),
  authorizationId: z.string().uuid(),
  executionId: z.string().uuid(),
  labInstanceId: z.string().uuid(),
  planId: z.string(),
  planHash: z.string().regex(/^[0-9a-f]{64}$/),
  nodeId: z.string(),
  labSlug: z.string(),
  accessMode: z.enum(['terminal', 'desktop']),
  workload: z.object({
    label: z.string(),
    kind: z.enum(['client', 'server']),
    hostname: z.string().optional(),
    role: z.string().optional(),
    runtimeProfileLabel: z.string().optional(),
    architecture: z.string().optional(),
    resourceClass: z.string().optional(),
    intendedAccessMode: z.string().optional(),
  }).strict(),
  executionStartedAt: z.string().datetime().optional(),
  evidenceRecordedAt: z.string().datetime(),
  limitations: z.array(z.string()).min(1).max(6),
}).strict();

export type DeploymentEvidenceFacts = z.infer<typeof deploymentEvidenceFactsSchema>;

export const deploymentEvidenceAnalysisSchema = z.object({
  summary: z.string().min(1).max(1200),
  observations: z.array(z.string().min(1).max(600)).min(1).max(8),
  interpretation: z.string().min(1).max(2400),
  learningPoints: z.array(z.string().min(1).max(700)).min(1).max(6),
  nextStep: z.string().min(1).max(1200),
  limitations: z.array(z.string().min(1).max(700)).min(1).max(6),
}).strict();

export type DeploymentEvidenceAnalysis = z.infer<typeof deploymentEvidenceAnalysisSchema>;

export class DeploymentEvidenceInterpretationError extends Error {
  constructor(message: string, readonly code: string) {
    super(message);
    this.name = 'DeploymentEvidenceInterpretationError';
  }
}

function conflict(message: string, code: string): never {
  throw new DeploymentEvidenceInterpretationError(message, code);
}

export function buildDeploymentEvidenceFacts(input: {
  authorization: DeploymentAuthorizationRecord;
  evidence: ExecutionEvidenceRecord;
}): DeploymentEvidenceFacts {
  const { authorization, evidence } = input;

  if (
    evidence.source !== 'deployment' ||
    evidence.surface !== 'infrastructure-designer' ||
    evidence.provenance !== 'provider-attested'
  ) {
    conflict('Evidence is not provider-attested Infrastructure Designer deployment evidence.', 'DEPLOYMENT_EVIDENCE_PROVENANCE_MISMATCH');
  }
  if (!authorization.executionId || !authorization.labInstanceId) {
    conflict('Deployment authorization is missing its execution binding.', 'DEPLOYMENT_AUTHORIZATION_BINDING_MISSING');
  }
  if (
    evidence.deploymentAuthorizationId !== authorization.id ||
    evidence.executionId !== authorization.executionId ||
    evidence.labInstanceId !== authorization.labInstanceId
  ) {
    conflict('Deployment evidence does not match the exact authorization execution binding.', 'DEPLOYMENT_EVIDENCE_BINDING_MISMATCH');
  }

  const parsed = deploymentEvidencePayloadSchema.safeParse(evidence.payload);
  if (!parsed.success) {
    conflict('Provider-attested deployment evidence has an invalid payload contract.', 'DEPLOYMENT_EVIDENCE_PAYLOAD_INVALID');
  }
  const payload = parsed.data;

  if (
    payload.authorizationId !== authorization.id ||
    payload.executionId !== authorization.executionId ||
    payload.planId !== authorization.planId ||
    payload.planHash !== authorization.planHash
  ) {
    conflict('Provider evidence identity does not match the authorized deployment plan.', 'DEPLOYMENT_EVIDENCE_PLAN_MISMATCH');
  }

  const target = authorization.executionSupport.target;
  if (
    !authorization.executionSupport.supported ||
    authorization.executionSupport.adapter !== 'existing-lab-vm' ||
    !target
  ) {
    conflict('The authorization no longer describes the controlled deployment adapter.', 'DEPLOYMENT_ADAPTER_BINDING_MISSING');
  }
  if (
    payload.nodeId !== target.nodeId ||
    payload.labSlug !== target.labSlug ||
    payload.accessMode !== target.accessMode
  ) {
    conflict('Provider evidence target does not match the authorized execution target.', 'DEPLOYMENT_EVIDENCE_TARGET_MISMATCH');
  }

  const workload = authorization.planSnapshot.workloads.find((candidate) => candidate.nodeId === payload.nodeId);
  if (!workload) {
    conflict('Provider evidence references a workload that is not present in the authorized plan.', 'DEPLOYMENT_EVIDENCE_WORKLOAD_MISSING');
  }

  const runtimeProfile = workload.runtimeProfile === 'unspecified' ? null : workload.runtimeProfile;
  const evidenceRecordedAt = evidence.evidenceRecordedAt;
  if (!evidenceRecordedAt) {
    conflict('Provider evidence is missing its recorded timestamp.', 'DEPLOYMENT_EVIDENCE_TIMESTAMP_MISSING');
  }

  return deploymentEvidenceFactsSchema.parse({
    provenance: 'provider-attested',
    attestationScope: 'provider-allocation',
    provider: payload.provider,
    externalId: payload.externalId,
    labEventId: payload.labEventId,
    authorizationId: authorization.id,
    executionId: authorization.executionId,
    labInstanceId: authorization.labInstanceId,
    planId: authorization.planId,
    planHash: authorization.planHash,
    nodeId: payload.nodeId,
    labSlug: payload.labSlug,
    accessMode: payload.accessMode,
    workload: {
      label: workload.label,
      kind: workload.kind,
      ...(workload.hostname ? { hostname: workload.hostname } : {}),
      ...(workload.role ? { role: workload.role } : {}),
      ...(workload.runtimeProfileLabel ? { runtimeProfileLabel: workload.runtimeProfileLabel } : {}),
      ...(runtimeProfile ? {
        architecture: runtimeProfile.architecture,
        resourceClass: runtimeProfile.resourceClass,
        intendedAccessMode: runtimeProfile.accessMode,
      } : {}),
    },
    ...(evidence.executionStartedAt ? { executionStartedAt: evidence.executionStartedAt } : {}),
    evidenceRecordedAt,
    limitations: [
      'This evidence confirms that the controlled adapter received a provider allocation and identity for the authorized workload.',
      'It does not prove that the guest operating system completed booting.',
      'It does not prove SSM, terminal, desktop, service, application, or network readiness.',
      'Later runtime observations must provide separate evidence for reachability and workload health.',
    ],
  });
}

export function deploymentEvidenceAiConfigured() {
  return Boolean(process.env.OPENAI_API_KEY);
}

export function deploymentEvidenceModel() {
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

const DEPLOYMENT_ANALYSIS_JSON_SCHEMA = {
  type: 'object',
  properties: {
    summary: { type: 'string' },
    observations: { type: 'array', items: { type: 'string' }, minItems: 1, maxItems: 8 },
    interpretation: { type: 'string' },
    learningPoints: { type: 'array', items: { type: 'string' }, minItems: 1, maxItems: 6 },
    nextStep: { type: 'string' },
    limitations: { type: 'array', items: { type: 'string' }, minItems: 1, maxItems: 6 },
  },
  required: ['summary', 'observations', 'interpretation', 'learningPoints', 'nextStep', 'limitations'],
  additionalProperties: false,
};

export async function interpretDeploymentEvidence(facts: DeploymentEvidenceFacts): Promise<DeploymentEvidenceAnalysis> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error('Deployment evidence interpretation is not configured. Set OPENAI_API_KEY on the Oxsig server.');

  const instructions = `You are OXSIG explaining provider-attested infrastructure deployment evidence to a technical learner.

The supplied facts have already been validated server-side against the exact authorized deployment plan. Treat them as the only source of truth. Explain what was intended, what the provider allocation evidence directly proves, why the identifiers and mappings matter, and what the learner should verify next.

Critical constraints:
- Never claim the VM is booted, reachable, healthy, or ready merely because a provider allocation exists.
- Never invent operating-system state, IP addresses, services, ports, credentials, network reachability, or application health.
- Separate direct observations from interpretation.
- Preserve the distinction between plan intent and runtime evidence.
- Explicitly carry forward the attestation limitations.
- Keep the explanation educational and practical. The next step should gather new runtime evidence rather than assume success.`;

  const response = await fetch('https://api.openai.com/v1/responses', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: deploymentEvidenceModel(),
      store: false,
      instructions,
      input: `SERVER-VERIFIED DEPLOYMENT FACTS\n${JSON.stringify(facts, null, 2)}`,
      max_output_tokens: 1600,
      text: {
        format: {
          type: 'json_schema',
          name: 'oxsig_deployment_evidence_analysis',
          strict: true,
          schema: DEPLOYMENT_ANALYSIS_JSON_SCHEMA,
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
  if (!text) throw new Error('AI provider returned no usable deployment evidence analysis');
  return deploymentEvidenceAnalysisSchema.parse(JSON.parse(text));
}