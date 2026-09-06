import { describe, expect, it, vi } from 'vitest';
import type { RuntimeReadinessEvidenceRecord } from '@/lib/execution-evidence/runtime-readiness';
import type { DeploymentAuthorizationRecord } from './deployment-authorization';

vi.mock('server-only', () => ({}));

import {
  buildRuntimeReadinessFacts,
  buildRuntimeReadinessPayload,
  RuntimeReadinessInterpretationError,
} from './runtime-readiness-evidence';

const authorizationId = '11111111-1111-4111-8111-111111111111';
const deploymentExecutionId = '22222222-2222-4222-8222-222222222222';
const labInstanceId = '33333333-3333-4333-8333-333333333333';

function authorization(accessMode: 'terminal' | 'desktop' = 'terminal'): DeploymentAuthorizationRecord {
  return {
    id: authorizationId,
    ownerId: 'user-1',
    planId: 'plan_123',
    planHash: 'a'.repeat(64),
    planSnapshot: {
      version: 1,
      sourceDesignVersion: 1,
      summary: { devices: 1, links: 0, workloads: 1, networkFunctions: 0, segments: 0 },
      workloads: [{
        nodeId: 'server-1',
        kind: 'server',
        label: 'Learning server',
        role: 'Linux administration target',
        runtime: 'virtual-machine',
        runtimeProfile: {
          profileId: 'ubuntu-24-04',
          architecture: 'x86_64',
          resourceClass: 'lab-small',
          accessMode,
        },
        runtimeProfileLabel: 'Ubuntu 24.04',
        runtimeAdapter: { status: 'mapped-available', labSlug: 'ubuntu-server' },
      }],
      networkFunctions: [],
      segments: [],
      links: [],
      actions: [],
      readiness: { executable: true, blockers: [], warnings: [] },
    },
    sourceDesignUpdatedAt: '2026-09-06T01:00:00.000Z',
    executionSupport: {
      supported: true,
      adapter: 'existing-lab-vm',
      reasons: [],
      target: { nodeId: 'server-1', labSlug: 'ubuntu-server', accessMode },
    },
    state: 'analyzed',
    executionId: deploymentExecutionId,
    labInstanceId,
    expiresAt: '2026-09-06T02:00:00.000Z',
    createdAt: '2026-09-06T01:00:00.000Z',
    updatedAt: '2026-09-06T01:10:00.000Z',
  };
}

function diagnostics(overrides: Record<string, unknown> = {}) {
  return {
    region: 'eu-central-1',
    instanceId: 'i-0123456789abcdef0',
    ec2State: 'running',
    instanceProfileConfigured: true,
    ssmRegistered: true,
    ssmPingStatus: 'Online',
    ssmAgentVersion: '3.3.1234.0',
    platformType: 'Linux',
    platformName: 'Ubuntu',
    platformVersion: '24.04',
    ready: true,
    ...overrides,
  };
}

function evidence(payload: Record<string, unknown>): RuntimeReadinessEvidenceRecord {
  return {
    id: '44444444-4444-4444-8444-444444444444',
    ownerId: 'user-1',
    labInstanceId,
    deploymentAuthorizationId: authorizationId,
    executionId: '55555555-5555-4555-8555-555555555555',
    source: 'runtime-readiness',
    surface: 'infrastructure-designer',
    provenance: 'server-executed',
    state: 'evidence_recorded',
    payload,
    evidenceRecordedAt: '2026-09-06T01:20:00.000Z',
    createdAt: '2026-09-06T01:20:00.000Z',
    updatedAt: '2026-09-06T01:20:00.000Z',
  };
}

describe('runtime readiness evidence contract', () => {
  it('marks a terminal target ready only when EC2 and SSM management evidence are ready', () => {
    const payload = buildRuntimeReadinessPayload({
      authorization: authorization('terminal'),
      labInstanceId,
      diagnostics: diagnostics(),
      checkedAt: '2026-09-06T01:20:00.000Z',
    });

    expect(payload.readiness).toEqual({
      computeReady: true,
      managementReady: true,
      terminalPathReady: true,
      requestedAccessReady: true,
      desktopServiceAttested: false,
      state: 'ready',
    });
    expect(payload.ec2.provenance).toBe('provider-attested');
    expect(payload.ssm.provenance).toBe('provider-attested');
    expect(payload.oxsig.provenance).toBe('server-executed');
  });

  it('does not claim desktop readiness from SSM Online alone', () => {
    const payload = buildRuntimeReadinessPayload({
      authorization: authorization('desktop'),
      labInstanceId,
      diagnostics: diagnostics(),
      checkedAt: '2026-09-06T01:20:00.000Z',
    });

    expect(payload.readiness.managementReady).toBe(true);
    expect(payload.readiness.requestedAccessReady).toBe(false);
    expect(payload.readiness.desktopServiceAttested).toBe(false);
    expect(payload.readiness.state).toBe('management-ready');
  });

  it('records a not-ready state when the provider reports SSM offline', () => {
    const payload = buildRuntimeReadinessPayload({
      authorization: authorization('terminal'),
      labInstanceId,
      diagnostics: diagnostics({ ssmPingStatus: 'ConnectionLost', ready: false }),
      checkedAt: '2026-09-06T01:20:00.000Z',
    });

    expect(payload.readiness.computeReady).toBe(true);
    expect(payload.readiness.managementReady).toBe(false);
    expect(payload.readiness.requestedAccessReady).toBe(false);
    expect(payload.readiness.state).toBe('not-ready');
  });

  it('binds recorded readiness facts to the exact authorization and plan', () => {
    const auth = authorization('terminal');
    const payload = buildRuntimeReadinessPayload({
      authorization: auth,
      labInstanceId,
      diagnostics: diagnostics(),
      checkedAt: '2026-09-06T01:20:00.000Z',
    });

    const facts = buildRuntimeReadinessFacts({ authorization: auth, evidence: evidence(payload) });

    expect(facts.attestationScope).toBe('runtime-management-readiness');
    expect(facts.provenance).toBe('server-executed');
    expect(facts.planHash).toBe(auth.planHash);
    expect(facts.workload.label).toBe('Learning server');
    expect(facts.limitations.join(' ')).toContain('application');
  });

  it('rejects a readiness payload whose plan hash does not match the authorization', () => {
    const auth = authorization('terminal');
    const payload = buildRuntimeReadinessPayload({
      authorization: auth,
      labInstanceId,
      diagnostics: diagnostics(),
      checkedAt: '2026-09-06T01:20:00.000Z',
    });

    expect(() => buildRuntimeReadinessFacts({
      authorization: auth,
      evidence: evidence({ ...payload, planHash: 'b'.repeat(64) }),
    })).toThrowError(RuntimeReadinessInterpretationError);
  });
});