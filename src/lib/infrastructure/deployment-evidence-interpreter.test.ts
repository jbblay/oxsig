import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ExecutionEvidenceRecord } from '@/lib/execution-evidence/server';
import type { DeploymentAuthorizationRecord } from './deployment-authorization';

vi.mock('server-only', () => ({}));

import {
  buildDeploymentEvidenceFacts,
  interpretDeploymentEvidence,
} from './deployment-evidence-interpreter';

const authorizationId = '11111111-1111-4111-8111-111111111111';
const executionId = '22222222-2222-4222-8222-222222222222';
const labInstanceId = '33333333-3333-4333-8333-333333333333';
const evidenceId = '44444444-4444-4444-8444-444444444444';
const labEventId = '55555555-5555-4555-8555-555555555555';
const planHash = 'a'.repeat(64);
const now = '2026-09-06T01:10:00.000Z';

function authorization(overrides: Partial<DeploymentAuthorizationRecord> = {}): DeploymentAuthorizationRecord {
  return {
    id: authorizationId,
    ownerId: 'user-1',
    planId: 'plan_verified',
    planHash,
    planSnapshot: {
      version: 1,
      sourceDesignVersion: 1,
      summary: { devices: 1, links: 0, workloads: 1, networkFunctions: 0, segments: 0 },
      workloads: [{
        nodeId: 'server-1',
        kind: 'server',
        label: 'Ubuntu Server',
        hostname: 'web-1',
        role: 'Web server practice',
        runtime: 'virtual-machine',
        runtimeProfile: {
          profileId: 'ubuntu-24-04',
          architecture: 'x86_64',
          resourceClass: 'lab-small',
          accessMode: 'terminal',
        },
        runtimeProfileLabel: 'Ubuntu 24.04 LTS',
        runtimeAdapter: {
          status: 'mapped-available',
          labSlug: 'ubuntu-security-lab',
        },
      }],
      networkFunctions: [],
      segments: [],
      links: [],
      actions: [],
      readiness: { executable: true, blockers: [], warnings: [] },
    },
    sourceDesignUpdatedAt: now,
    executionSupport: {
      supported: true,
      adapter: 'existing-lab-vm',
      reasons: [],
      target: {
        nodeId: 'server-1',
        labSlug: 'ubuntu-security-lab',
        accessMode: 'terminal',
      },
    },
    state: 'evidence_recorded',
    executionId,
    labInstanceId,
    receiptIssuedAt: now,
    executionStartedAt: now,
    evidenceRecordedAt: now,
    expiresAt: '2026-09-06T01:25:00.000Z',
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

function evidence(overrides: Partial<ExecutionEvidenceRecord> = {}): ExecutionEvidenceRecord {
  return {
    id: evidenceId,
    ownerId: 'user-1',
    labInstanceId,
    deploymentAuthorizationId: authorizationId,
    executionId,
    source: 'deployment',
    surface: 'infrastructure-designer',
    provenance: 'provider-attested',
    state: 'evidence_recorded',
    stdout: '',
    stderr: '',
    payload: {
      authorizationId,
      executionId,
      planId: 'plan_verified',
      planHash,
      provider: 'aws-ec2',
      externalId: 'i-0123456789abcdef0',
      nodeId: 'server-1',
      labSlug: 'ubuntu-security-lab',
      accessMode: 'terminal',
      labEventId,
    },
    executionStartedAt: now,
    evidenceRecordedAt: now,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

describe('deployment evidence interpretation', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    process.env.OPENAI_API_KEY = 'test-key';
    process.env.OXSIG_AI_MODEL = 'test-model';
  });

  it('builds facts only when provider evidence matches the exact authorized target', () => {
    const facts = buildDeploymentEvidenceFacts({ authorization: authorization(), evidence: evidence() });

    expect(facts).toMatchObject({
      provenance: 'provider-attested',
      attestationScope: 'provider-allocation',
      provider: 'aws-ec2',
      externalId: 'i-0123456789abcdef0',
      planHash,
      nodeId: 'server-1',
      labSlug: 'ubuntu-security-lab',
      accessMode: 'terminal',
      workload: {
        label: 'Ubuntu Server',
        runtimeProfileLabel: 'Ubuntu 24.04 LTS',
        architecture: 'x86_64',
        resourceClass: 'lab-small',
      },
    });
    expect(facts.limitations.join(' ')).toContain('does not prove');
  });

  it('rejects provider evidence whose plan identity differs from the authorization', () => {
    const mismatched = evidence({
      payload: {
        ...evidence().payload,
        planHash: 'b'.repeat(64),
      },
    });

    expect(() => buildDeploymentEvidenceFacts({ authorization: authorization(), evidence: mismatched }))
      .toThrowError(/does not match the authorized deployment plan/i);
  });

  it('sends only server-verified facts to the structured AI interpreter', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({
      output_text: JSON.stringify({
        summary: 'The controlled adapter received an AWS EC2 allocation for the authorized workload.',
        observations: ['The provider returned instance i-0123456789abcdef0.'],
        interpretation: 'The plan-to-provider mapping is confirmed at the allocation boundary.',
        learningPoints: ['A provider allocation is evidence of resource creation, not guest readiness.'],
        nextStep: 'Observe the runtime state and collect separate readiness evidence.',
        limitations: ['Boot completion and terminal readiness are not proven by this evidence.'],
      }),
    }), { status: 200 }));

    const facts = buildDeploymentEvidenceFacts({ authorization: authorization(), evidence: evidence() });
    const analysis = await interpretDeploymentEvidence(facts);

    expect(analysis.summary).toContain('AWS EC2 allocation');
    const request = fetchMock.mock.calls[0]?.[1];
    const body = JSON.parse(String(request?.body));
    expect(body.model).toBe('test-model');
    expect(body.input).toContain('SERVER-VERIFIED DEPLOYMENT FACTS');
    expect(body.input).toContain('i-0123456789abcdef0');
    expect(body.input).not.toContain('client-supplied');
  });
});