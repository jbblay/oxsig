import 'server-only';

import { z } from 'zod';
import type { AccessPathReadinessEvidenceRecord } from '@/lib/execution-evidence/access-path-readiness';
import type { GuestServiceReadinessEvidenceRecord } from '@/lib/execution-evidence/guest-service-readiness';
import type { DesktopAccessEvidenceTicketClaims } from '@/lib/labs/desktop-access-evidence-ticket';
import type { DeploymentAuthorizationRecord } from './deployment-authorization';
import {
  guestServiceReadinessPayloadSchema,
  type GuestServiceReadinessFacts,
} from './guest-service-readiness-evidence';

export const browserAccessObservationSchema = z.object({
  ssmChannelReady: z.literal(true),
  rfbHandshakeComplete: z.literal(true),
  rfbProtocolVersion: z.string().regex(/^RFB 003\.\d{3}$/),
  desktopName: z.string().max(255),
  framebuffer: z.object({
    width: z.number().int().min(1).max(8192),
    height: z.number().int().min(1).max(8192),
  }).strict(),
}).strict();

export type BrowserAccessObservation = z.infer<typeof browserAccessObservationSchema>;

export const accessPathReadinessPayloadSchema = z.object({
  version: z.literal(1),
  authorizationId: z.string().uuid(),
  deploymentExecutionId: z.string().uuid(),
  planId: z.string().min(1).max(200),
  planHash: z.string().regex(/^[0-9a-f]{64}$/),
  labInstanceId: z.string().uuid(),
  prerequisiteGuestEvidenceId: z.string().uuid(),
  target: z.object({
    nodeId: z.string().min(1).max(160),
    labSlug: z.string().min(1).max(160),
    accessMode: z.literal('desktop'),
  }).strict(),
  session: z.object({
    provenance: z.literal('server-executed'),
    provider: z.literal('aws-ssm'),
    sessionId: z.string().min(1).max(128),
    target: z.string().min(1).max(128),
    platform: z.enum(['linux', 'windows']),
    port: z.number().int().min(1).max(65535),
    issuedAt: z.string().datetime(),
  }).strict(),
  browser: z.object({
    provenance: z.literal('browser-observed'),
    observationPath: z.literal('same-origin-ssm-websocket-rfb'),
    ssmChannelReady: z.literal(true),
    rfbHandshakeComplete: z.literal(true),
    rfbProtocolVersion: z.string().regex(/^RFB 003\.\d{3}$/),
    desktopName: z.string().max(255),
    framebuffer: z.object({
      width: z.number().int().min(1).max(8192),
      height: z.number().int().min(1).max(8192),
    }).strict(),
  }).strict(),
  readiness: z.object({
    guestServiceReady: z.literal(true),
    ssmSessionIssued: z.literal(true),
    rfbHandshakeObserved: z.literal(true),
    browserDesktopPathReady: z.literal(true),
    state: z.literal('ready'),
  }).strict(),
  reportReceivedAt: z.string().datetime(),
}).strict();

export type AccessPathReadinessPayload = z.infer<typeof accessPathReadinessPayloadSchema>;

export const accessPathReadinessFactsSchema = accessPathReadinessPayloadSchema.extend({
  provenance: z.literal('browser-observed'),
  attestationScope: z.literal('browser-desktop-access-path'),
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

export type AccessPathReadinessFacts = z.infer<typeof accessPathReadinessFactsSchema>;

export const accessPathReadinessAnalysisSchema = z.object({
  summary: z.string().min(1).max(1200),
  observations: z.array(z.string().min(1).max(700)).min(1).max(8),
  interpretation: z.string().min(1).max(2400),
  learningPoints: z.array(z.string().min(1).max(700)).min(1).max(6),
  nextStep: z.string().min(1).max(1200),
  limitations: z.array(z.string().min(1).max(700)).min(1).max(8),
}).strict();

export type AccessPathReadinessAnalysis = z.infer<typeof accessPathReadinessAnalysisSchema>;

export class AccessPathReadinessInterpretationError extends Error {
  constructor(message: string, readonly code: string) {
    super(message);
    this.name = 'AccessPathReadinessInterpretationError';
  }
}

function conflict(message: string, code: string): never {
  throw new AccessPathReadinessInterpretationError(message, code);
}

function controlledDesktopTarget(authorization: DeploymentAuthorizationRecord) {
  const target = authorization.executionSupport.target;
  if (!authorization.executionId || !authorization.labInstanceId) {
    conflict('Deployment authorization is missing its execution binding.', 'ACCESS_PATH_AUTHORIZATION_BINDING_MISSING');
  }
  if (
    !authorization.executionSupport.supported ||
    authorization.executionSupport.adapter !== 'existing-lab-vm' ||
    !target
  ) {
    conflict('Deployment authorization does not use the controlled lab runtime adapter.', 'ACCESS_PATH_ADAPTER_MISMATCH');
  }
  if (target.accessMode !== 'desktop') {
    conflict('Browser desktop access-path evidence applies only to desktop workloads.', 'ACCESS_PATH_NOT_APPLICABLE');
  }
  return target;
}

function assertGuestPrerequisite(
  authorization: DeploymentAuthorizationRecord,
  guestEvidence: GuestServiceReadinessEvidenceRecord
) {
  const target = controlledDesktopTarget(authorization);
  if (
    guestEvidence.deploymentAuthorizationId !== authorization.id ||
    guestEvidence.labInstanceId !== authorization.labInstanceId
  ) {
    conflict('Guest-service evidence does not match the controlled desktop deployment.', 'ACCESS_PATH_GUEST_BINDING_MISMATCH');
  }
  const parsed = guestServiceReadinessPayloadSchema.safeParse(guestEvidence.payload);
  if (!parsed.success) conflict('Guest-service prerequisite has an invalid payload contract.', 'ACCESS_PATH_GUEST_PAYLOAD_INVALID');
  const guest = parsed.data;
  if (
    guest.authorizationId !== authorization.id ||
    guest.deploymentExecutionId !== authorization.executionId ||
    guest.labInstanceId !== authorization.labInstanceId ||
    guest.planId !== authorization.planId ||
    guest.planHash !== authorization.planHash ||
    guest.target.nodeId !== target.nodeId ||
    guest.target.labSlug !== target.labSlug ||
    guest.target.accessMode !== 'desktop'
  ) {
    conflict('Guest-service prerequisite does not match the exact authorized plan.', 'ACCESS_PATH_GUEST_PLAN_MISMATCH');
  }
  if (!guest.readiness.guestServiceReady || guest.readiness.state !== 'ready') {
    conflict('Guest desktop service must be ready before end-to-end access can be recorded.', 'ACCESS_PATH_GUEST_NOT_READY');
  }
  return { target, guest };
}

export function buildAccessPathReadinessPayload(input: {
  authorization: DeploymentAuthorizationRecord;
  guestEvidence: GuestServiceReadinessEvidenceRecord;
  ticket: DesktopAccessEvidenceTicketClaims;
  observation: BrowserAccessObservation;
  receivedAt?: string;
}): AccessPathReadinessPayload {
  const { authorization, guestEvidence, ticket, observation } = input;
  const { target } = assertGuestPrerequisite(authorization, guestEvidence);

  if (
    ticket.ownerId.length < 1 ||
    ticket.labInstanceId !== authorization.labInstanceId ||
    ticket.deploymentAuthorizationId !== authorization.id ||
    ticket.deploymentExecutionId !== authorization.executionId ||
    ticket.planId !== authorization.planId ||
    ticket.planHash !== authorization.planHash ||
    ticket.prerequisiteGuestEvidenceId !== guestEvidence.id ||
    ticket.target.length < 1 ||
    ticket.port < 1
  ) {
    conflict('Desktop access evidence ticket does not match the authorized evidence chain.', 'ACCESS_PATH_TICKET_BINDING_MISMATCH');
  }

  return accessPathReadinessPayloadSchema.parse({
    version: 1,
    authorizationId: authorization.id,
    deploymentExecutionId: authorization.executionId,
    planId: authorization.planId,
    planHash: authorization.planHash,
    labInstanceId: authorization.labInstanceId,
    prerequisiteGuestEvidenceId: guestEvidence.id,
    target: {
      nodeId: target.nodeId,
      labSlug: target.labSlug,
      accessMode: 'desktop',
    },
    session: {
      provenance: 'server-executed',
      provider: 'aws-ssm',
      sessionId: ticket.sessionId,
      target: ticket.target,
      platform: ticket.platform,
      port: ticket.port,
      issuedAt: new Date(ticket.iat).toISOString(),
    },
    browser: {
      provenance: 'browser-observed',
      observationPath: 'same-origin-ssm-websocket-rfb',
      ...observation,
    },
    readiness: {
      guestServiceReady: true,
      ssmSessionIssued: true,
      rfbHandshakeObserved: true,
      browserDesktopPathReady: true,
      state: 'ready',
    },
    reportReceivedAt: input.receivedAt || new Date().toISOString(),
  });
}

export function buildAccessPathReadinessFacts(input: {
  authorization: DeploymentAuthorizationRecord;
  guestFacts: GuestServiceReadinessFacts;
  evidence: AccessPathReadinessEvidenceRecord;
}): AccessPathReadinessFacts {
  const { authorization, guestFacts, evidence } = input;
  const target = controlledDesktopTarget(authorization);
  if (
    evidence.deploymentAuthorizationId !== authorization.id ||
    evidence.labInstanceId !== authorization.labInstanceId
  ) {
    conflict('Access-path evidence does not match its deployment authorization.', 'ACCESS_PATH_EVIDENCE_BINDING_MISMATCH');
  }

  const parsed = accessPathReadinessPayloadSchema.safeParse(evidence.payload);
  if (!parsed.success) conflict('Access-path evidence has an invalid payload contract.', 'ACCESS_PATH_PAYLOAD_INVALID');
  const payload = parsed.data;
  if (
    payload.authorizationId !== authorization.id ||
    payload.deploymentExecutionId !== authorization.executionId ||
    payload.labInstanceId !== authorization.labInstanceId ||
    payload.planId !== authorization.planId ||
    payload.planHash !== authorization.planHash ||
    payload.prerequisiteGuestEvidenceId !== guestFacts.evidenceId
  ) {
    conflict('Access-path evidence identity does not match the exact guest-service evidence chain.', 'ACCESS_PATH_PLAN_MISMATCH');
  }
  if (
    payload.target.nodeId !== target.nodeId ||
    payload.target.labSlug !== target.labSlug ||
    payload.target.accessMode !== 'desktop'
  ) {
    conflict('Access-path evidence target does not match the authorized desktop target.', 'ACCESS_PATH_TARGET_MISMATCH');
  }

  const workload = authorization.planSnapshot.workloads.find((candidate) => candidate.nodeId === target.nodeId);
  if (!workload) conflict('Access-path evidence references a workload missing from the authorized plan.', 'ACCESS_PATH_WORKLOAD_MISSING');

  const limitations = [
    'The SSM desktop session claim is issued by the OXSIG server, but the final RFB/VNC negotiation is observed by the authenticated browser; the aggregate evidence provenance is therefore browser-observed.',
    'A completed RFB server-init handshake proves that the browser received and parsed a valid desktop protocol response through the controlled bridge at the recorded time.',
    'This evidence does not provider-attest the browser pixels, prove that a human viewed them, or prove any keyboard or pointer action occurred.',
    'The browser observation is bound to a short-lived encrypted server ticket so it cannot select a different lab, authorization, plan, prerequisite guest evidence record, or Session Manager session.',
    'This evidence does not prove arbitrary application health, public reachability, east-west network connectivity, or future availability after the recorded observation.',
  ];

  return accessPathReadinessFactsSchema.parse({
    ...payload,
    provenance: 'browser-observed',
    attestationScope: 'browser-desktop-access-path',
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

export function accessPathReadinessAiConfigured() {
  return Boolean(process.env.OPENAI_API_KEY);
}

export function accessPathReadinessModel() {
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

const ACCESS_PATH_ANALYSIS_JSON_SCHEMA = {
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

export async function interpretAccessPathReadinessEvidence(
  facts: AccessPathReadinessFacts
): Promise<AccessPathReadinessAnalysis> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error('Access-path interpretation is not configured. Set OPENAI_API_KEY on the OXSIG server.');

  const instructions = `You are OXSIG explaining end-to-end browser desktop access evidence to a technical learner.

The supplied facts are bound to an exact controlled deployment and a prior guest-service readiness record. The server issued the SSM session claim, while the final RFB/VNC handshake was observed by the authenticated browser. Treat the deterministic readiness fields as authoritative but preserve the provenance distinction.

Critical constraints:
- Separate direct observations from interpretation.
- Say browser-observed, not provider-attested, for the final RFB/display-path result.
- A successful RFB server-init handshake proves the browser reached a valid VNC endpoint through the controlled path at that time; it does not prove human attention or later availability.
- Never invent credentials, public ports, IP addresses, application health, learner actions, or network reachability beyond the supplied facts.
- Explain why the short-lived server ticket strengthens binding without converting browser evidence into provider attestation.
- Carry forward the supplied limitations.
- The next step should gather learner interaction or task evidence, not re-prove the same transport layer.`;

  const response = await fetch('https://api.openai.com/v1/responses', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: accessPathReadinessModel(),
      store: false,
      instructions,
      input: `BOUND BROWSER DESKTOP ACCESS FACTS\n${JSON.stringify(facts, null, 2)}`,
      max_output_tokens: 1700,
      text: {
        format: {
          type: 'json_schema',
          name: 'oxsig_access_path_readiness_analysis',
          strict: true,
          schema: ACCESS_PATH_ANALYSIS_JSON_SCHEMA,
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
  if (!text) throw new Error('AI provider returned no usable access-path readiness analysis');
  return accessPathReadinessAnalysisSchema.parse(JSON.parse(text));
}
