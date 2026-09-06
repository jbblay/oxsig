import 'server-only';

import { z } from 'zod';
import type { GuestServiceReadinessEvidenceRecord } from '@/lib/execution-evidence/guest-service-readiness';
import type { DesktopServiceInspection } from '@/lib/labs/desktop-runtime';
import type { DeploymentAuthorizationRecord } from './deployment-authorization';
import type { RuntimeReadinessFacts } from './runtime-readiness-evidence';

const nullableShortString = z.string().max(255).nullable();

export const guestServiceReadinessPayloadSchema = z.object({
  version: z.literal(1),
  authorizationId: z.string().uuid(),
  deploymentExecutionId: z.string().uuid(),
  planId: z.string().min(1).max(200),
  planHash: z.string().regex(/^[0-9a-f]{64}$/),
  labInstanceId: z.string().uuid(),
  prerequisiteRuntimeEvidenceId: z.string().uuid(),
  target: z.object({
    nodeId: z.string().min(1).max(160),
    labSlug: z.string().min(1).max(160),
    accessMode: z.literal('desktop'),
  }).strict(),
  guest: z.object({
    provenance: z.literal('server-executed'),
    observationPath: z.literal('aws-ssm-run-command'),
    platform: z.enum(['linux', 'windows']),
    serviceName: z.string().min(1).max(160),
    expectedPort: z.number().int().min(1).max(65535),
    serviceInstalled: z.boolean(),
    serviceState: z.string().min(1).max(64),
    serviceRunning: z.boolean(),
    readyMarkerPresent: z.boolean(),
    listenerPresent: z.boolean(),
    listenerAddress: nullableShortString,
    loopbackOnly: z.boolean(),
    commandExitCode: z.number().int().min(-1).max(255),
  }).strict(),
  readiness: z.object({
    managementReady: z.literal(true),
    guestServiceReady: z.boolean(),
    requestedAccessReady: z.boolean(),
    state: z.enum(['ready', 'not-ready']),
  }).strict(),
  checkedAt: z.string().datetime(),
}).strict();

export type GuestServiceReadinessPayload = z.infer<typeof guestServiceReadinessPayloadSchema>;

export const guestServiceReadinessFactsSchema = guestServiceReadinessPayloadSchema.extend({
  provenance: z.literal('server-executed'),
  attestationScope: z.literal('guest-desktop-service-readiness'),
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

export type GuestServiceReadinessFacts = z.infer<typeof guestServiceReadinessFactsSchema>;

export const guestServiceReadinessAnalysisSchema = z.object({
  summary: z.string().min(1).max(1200),
  observations: z.array(z.string().min(1).max(700)).min(1).max(8),
  interpretation: z.string().min(1).max(2400),
  learningPoints: z.array(z.string().min(1).max(700)).min(1).max(6),
  nextStep: z.string().min(1).max(1200),
  limitations: z.array(z.string().min(1).max(700)).min(1).max(8),
}).strict();

export type GuestServiceReadinessAnalysis = z.infer<typeof guestServiceReadinessAnalysisSchema>;

export class GuestServiceReadinessInterpretationError extends Error {
  constructor(message: string, readonly code: string) {
    super(message);
    this.name = 'GuestServiceReadinessInterpretationError';
  }
}

function conflict(message: string, code: string): never {
  throw new GuestServiceReadinessInterpretationError(message, code);
}

function assertCommonBinding(authorization: DeploymentAuthorizationRecord, runtimeFacts: RuntimeReadinessFacts) {
  const target = authorization.executionSupport.target;
  if (!authorization.executionId || !authorization.labInstanceId) {
    conflict('Deployment authorization is missing its execution binding.', 'GUEST_SERVICE_AUTHORIZATION_BINDING_MISSING');
  }
  if (
    !authorization.executionSupport.supported ||
    authorization.executionSupport.adapter !== 'existing-lab-vm' ||
    !target
  ) {
    conflict('Deployment authorization does not use the controlled lab runtime adapter.', 'GUEST_SERVICE_ADAPTER_MISMATCH');
  }
  if (target.accessMode !== 'desktop') {
    conflict('Guest desktop-service readiness applies only to desktop workloads.', 'GUEST_SERVICE_NOT_APPLICABLE');
  }
  if (
    runtimeFacts.authorizationId !== authorization.id ||
    runtimeFacts.deploymentExecutionId !== authorization.executionId ||
    runtimeFacts.labInstanceId !== authorization.labInstanceId ||
    runtimeFacts.planId !== authorization.planId ||
    runtimeFacts.planHash !== authorization.planHash ||
    runtimeFacts.target.nodeId !== target.nodeId ||
    runtimeFacts.target.labSlug !== target.labSlug ||
    runtimeFacts.target.accessMode !== 'desktop'
  ) {
    conflict('Runtime-management evidence does not match the exact desktop deployment.', 'GUEST_SERVICE_RUNTIME_BINDING_MISMATCH');
  }
  if (!runtimeFacts.readiness.managementReady) {
    conflict('Runtime management must be ready before guest-service inspection can run.', 'GUEST_SERVICE_MANAGEMENT_NOT_READY');
  }
  return target;
}

export function buildGuestServiceReadinessPayload(input: {
  authorization: DeploymentAuthorizationRecord;
  runtimeFacts: RuntimeReadinessFacts;
  inspection: DesktopServiceInspection;
  checkedAt?: string;
}): GuestServiceReadinessPayload {
  const { authorization, runtimeFacts, inspection } = input;
  const target = assertCommonBinding(authorization, runtimeFacts);
  const guestServiceReady = inspection.ready;

  return guestServiceReadinessPayloadSchema.parse({
    version: 1,
    authorizationId: authorization.id,
    deploymentExecutionId: authorization.executionId,
    planId: authorization.planId,
    planHash: authorization.planHash,
    labInstanceId: authorization.labInstanceId,
    prerequisiteRuntimeEvidenceId: runtimeFacts.evidenceId,
    target: {
      nodeId: target.nodeId,
      labSlug: target.labSlug,
      accessMode: 'desktop',
    },
    guest: {
      provenance: 'server-executed',
      observationPath: 'aws-ssm-run-command',
      platform: inspection.platform,
      serviceName: inspection.serviceName,
      expectedPort: inspection.expectedPort,
      serviceInstalled: inspection.serviceInstalled,
      serviceState: inspection.serviceState,
      serviceRunning: inspection.serviceRunning,
      readyMarkerPresent: inspection.readyMarkerPresent,
      listenerPresent: inspection.listenerPresent,
      listenerAddress: inspection.listenerAddress,
      loopbackOnly: inspection.loopbackOnly,
      commandExitCode: inspection.exitCode,
    },
    readiness: {
      managementReady: true,
      guestServiceReady,
      requestedAccessReady: guestServiceReady,
      state: guestServiceReady ? 'ready' : 'not-ready',
    },
    checkedAt: input.checkedAt || new Date().toISOString(),
  });
}

export function buildGuestServiceReadinessFacts(input: {
  authorization: DeploymentAuthorizationRecord;
  runtimeFacts: RuntimeReadinessFacts;
  evidence: GuestServiceReadinessEvidenceRecord;
}): GuestServiceReadinessFacts {
  const { authorization, runtimeFacts, evidence } = input;
  const target = assertCommonBinding(authorization, runtimeFacts);

  if (
    evidence.deploymentAuthorizationId !== authorization.id ||
    evidence.labInstanceId !== authorization.labInstanceId
  ) {
    conflict('Guest-service evidence does not match its deployment authorization.', 'GUEST_SERVICE_EVIDENCE_BINDING_MISMATCH');
  }

  const parsed = guestServiceReadinessPayloadSchema.safeParse(evidence.payload);
  if (!parsed.success) {
    conflict('Guest-service evidence has an invalid payload contract.', 'GUEST_SERVICE_PAYLOAD_INVALID');
  }
  const payload = parsed.data;

  if (
    payload.authorizationId !== authorization.id ||
    payload.deploymentExecutionId !== authorization.executionId ||
    payload.labInstanceId !== authorization.labInstanceId ||
    payload.planId !== authorization.planId ||
    payload.planHash !== authorization.planHash ||
    payload.prerequisiteRuntimeEvidenceId !== runtimeFacts.evidenceId
  ) {
    conflict('Guest-service evidence identity does not match the exact authorized runtime evidence chain.', 'GUEST_SERVICE_PLAN_MISMATCH');
  }
  if (
    payload.target.nodeId !== target.nodeId ||
    payload.target.labSlug !== target.labSlug ||
    payload.target.accessMode !== 'desktop'
  ) {
    conflict('Guest-service evidence target does not match the authorized desktop target.', 'GUEST_SERVICE_TARGET_MISMATCH');
  }

  const workload = authorization.planSnapshot.workloads.find((candidate) => candidate.nodeId === target.nodeId);
  if (!workload) {
    conflict('Guest-service evidence references a workload missing from the authorized plan.', 'GUEST_SERVICE_WORKLOAD_MISSING');
  }

  const limitations = [
    'OXSIG executed a fixed read-only inspection inside the guest through AWS Systems Manager; these guest facts are server-executed observations, not AWS control-plane attestations.',
    'A running desktop service plus the expected loopback listener proves local guest-service readiness only at the time of this check.',
    'Loopback-only binding is required by this contract; a listener on a non-loopback address is treated as not ready rather than as successful exposure.',
    'This check does not open an SSM port-forwarding session and does not prove an end-to-end RFB/VNC handshake from the browser.',
    'This check does not prove arbitrary application health, public reachability, east-west connectivity, or learner interaction with the desktop.',
  ];

  return guestServiceReadinessFactsSchema.parse({
    ...payload,
    provenance: 'server-executed',
    attestationScope: 'guest-desktop-service-readiness',
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

export function guestServiceReadinessAiConfigured() {
  return Boolean(process.env.OPENAI_API_KEY);
}

export function guestServiceReadinessModel() {
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

const GUEST_SERVICE_ANALYSIS_JSON_SCHEMA = {
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

export async function interpretGuestServiceReadinessEvidence(
  facts: GuestServiceReadinessFacts
): Promise<GuestServiceReadinessAnalysis> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error('Guest-service interpretation is not configured. Set OPENAI_API_KEY on the OXSIG server.');

  const instructions = `You are OXSIG explaining guest desktop-service readiness evidence to a technical learner.

The supplied facts are server-verified and bound to an exact controlled deployment plus a prior management-readiness evidence record. Treat the deterministic readiness fields as authoritative. Your job is to explain them, not recalculate or override them.

Critical constraints:
- Separate direct observations from interpretation.
- A running service and expected loopback listener mean the guest desktop service is locally ready at the check time.
- Never call this end-to-end desktop readiness unless the facts prove it. This check does not open the browser tunnel or perform an RFB/VNC handshake.
- Never invent IP addresses, credentials, ports other than the supplied expected port, network reachability, application health, or learner interaction.
- Explain why loopback-only binding is a security property, not a failure.
- Carry forward the supplied limitations.
- The next step should gather the next missing access-path evidence rather than assume it.`;

  const response = await fetch('https://api.openai.com/v1/responses', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: guestServiceReadinessModel(),
      store: false,
      instructions,
      input: `SERVER-VERIFIED GUEST SERVICE FACTS\n${JSON.stringify(facts, null, 2)}`,
      max_output_tokens: 1700,
      text: {
        format: {
          type: 'json_schema',
          name: 'oxsig_guest_service_readiness_analysis',
          strict: true,
          schema: GUEST_SERVICE_ANALYSIS_JSON_SCHEMA,
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
  if (!text) throw new Error('AI provider returned no usable guest-service readiness analysis');
  return guestServiceReadinessAnalysisSchema.parse(JSON.parse(text));
}
