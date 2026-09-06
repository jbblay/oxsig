import { describe, expect, it, vi } from 'vitest';
import type { GuestServiceReadinessEvidenceRecord } from '@/lib/execution-evidence/guest-service-readiness';
import type { DesktopServiceInspection } from '@/lib/labs/desktop-runtime';
import type { DeploymentAuthorizationRecord } from './deployment-authorization';
import type { RuntimeReadinessFacts } from './runtime-readiness-evidence';

vi.mock('server-only', () => ({}));

import {
  buildGuestServiceReadinessFacts,
  buildGuestServiceReadinessPayload,
  GuestServiceReadinessInterpretationError,
} from './guest-service-readiness-evidence';

const authorizationId = '11111111-1111-4111-8111-111111111111';
const deploymentExecutionId = '22222222-2222-4222-8222-222222222222';
const labInstanceId = '33333333-3333-4333-8333-333333333333';
const runtimeEvidenceId = '44444444-4444-4444-8444-444444444444';

function authorization(accessMode: 'terminal' | 'desktop' = 'desktop'): DeploymentAuthorizationRecord {
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
        label: 'Desktop learning server',
        role: 'GUI administration target',
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
    expiresAt: '2099-09-06T02:00:00.000Z',
    createdAt: '2026-09-06T01:00:00.000Z',
    updatedAt: '2026-09-06T01:10:00.000Z',
  };
}

function runtimeFacts(overrides: Record<string, unknown> = {}): RuntimeReadinessFacts {
  return {
    version: 1,
    provenance: 'server-executed',
    attestationScope: 'runtime-management-readiness',
    authorizationId,
    deploymentExecutionId,
    evidenceId: runtimeEvidenceId,
    evidenceExecutionId: '55555555-5555-4555-8555-555555555555',
    planId: 'plan_123',
    planHash: 'a'.repeat(64),
    labInstanceId,
    target: { nodeId: 'server-1', labSlug: 'ubuntu-server', accessMode: 'desktop' },
    ec2: { provenance: 'provider-attested', provider: 'aws-ec2', region: 'eu-central-1', externalId: 'i-0123456789abcdef0', state: 'running' },
    ssm: { provenance: 'provider-attested', provider: 'aws-ssm', registered: true, pingStatus: 'Online', agentVersion: '3.3.1', platformType: 'Linux', platformName: 'Ubuntu', platformVersion: '24.04' },
    oxsig: { provenance: 'server-executed', instanceProfileConfigured: true },
    readiness: { computeReady: true, managementReady: true, terminalPathReady: true, requestedAccessReady: false, desktopServiceAttested: false, state: 'management-ready' },
    checkedAt: '2026-09-06T01:20:00.000Z',
    evidenceRecordedAt: '2026-09-06T01:20:00.000Z',
    workload: { label: 'Desktop learning server', kind: 'server', runtimeProfileLabel: 'Ubuntu 24.04' },
    limitations: ['Desktop service readiness is not attested yet.'],
    ...overrides,
  } as RuntimeReadinessFacts;
}

function inspection(overrides: Partial<DesktopServiceInspection> = {}): DesktopServiceInspection {
  return {
    platform: 'linux',
    serviceName: 'oxsig-desktop-vnc.service',
    expectedPort: 5901,
    serviceInstalled: true,
    serviceState: 'active',
    serviceRunning: true,
    readyMarkerPresent: true,
    listenerPresent: true,
    listenerAddress: '127.0.0.1:5901',
    loopbackOnly: true,
    ready: true,
    exitCode: 0,
    ...overrides,
  };
}

function evidence(payload: Record<string, unknown>): GuestServiceReadinessEvidenceRecord {
  return {
    id: '66666666-6666-4666-8666-666666666666',
    ownerId: 'user-1',
    labInstanceId,
    deploymentAuthorizationId: authorizationId,
    executionId: '77777777-7777-4777-8777-777777777777',
    source: 'guest-service-readiness',
    surface: 'infrastructure-designer',
    provenance: 'server-executed',
    state: 'evidence_recorded',
    payload,
    evidenceRecordedAt: '2026-09-06T01:30:00.000Z',
    createdAt: '2026-09-06T01:30:00.000Z',
    updatedAt: '2026-09-06T01:30:00.000Z',
  };
}

describe('guest service readiness evidence contract', () => {
  it('marks desktop guest service ready only from a complete local loopback observation', () => {
    const payload = buildGuestServiceReadinessPayload({
      authorization: authorization(),
      runtimeFacts: runtimeFacts(),
      inspection: inspection(),
      checkedAt: '2026-09-06T01:30:00.000Z',
    });

    expect(payload.readiness).toEqual({
      managementReady: true,
      guestServiceReady: true,
      requestedAccessReady: true,
      state: 'ready',
    });
    expect(payload.guest.loopbackOnly).toBe(true);
    expect(payload.prerequisiteRuntimeEvidenceId).toBe(runtimeEvidenceId);
  });

  it('records a non-loopback listener as not ready', () => {
    const payload = buildGuestServiceReadinessPayload({
      authorization: authorization(),
      runtimeFacts: runtimeFacts(),
      inspection: inspection({ listenerAddress: '0.0.0.0:5901', loopbackOnly: false, ready: false }),
    });

    expect(payload.guest.listenerPresent).toBe(true);
    expect(payload.guest.loopbackOnly).toBe(false);
    expect(payload.readiness.state).toBe('not-ready');
  });

  it('rejects a terminal-only authorization', () => {
    expect(() => buildGuestServiceReadinessPayload({
      authorization: authorization('terminal'),
      runtimeFacts: runtimeFacts({ target: { nodeId: 'server-1', labSlug: 'ubuntu-server', accessMode: 'terminal' } }),
      inspection: inspection(),
    })).toThrowError(GuestServiceReadinessInterpretationError);
  });

  it('requires prior management-ready evidence', () => {
    const notReady = runtimeFacts({
      readiness: { computeReady: true, managementReady: false, terminalPathReady: false, requestedAccessReady: false, desktopServiceAttested: false, state: 'not-ready' },
    });

    expect(() => buildGuestServiceReadinessPayload({
      authorization: authorization(),
      runtimeFacts: notReady,
      inspection: inspection(),
    })).toThrowError(GuestServiceReadinessInterpretationError);
  });

  it('binds stored guest facts to the exact prerequisite evidence and plan', () => {
    const auth = authorization();
    const runtime = runtimeFacts();
    const payload = buildGuestServiceReadinessPayload({ authorization: auth, runtimeFacts: runtime, inspection: inspection() });
    const facts = buildGuestServiceReadinessFacts({ authorization: auth, runtimeFacts: runtime, evidence: evidence(payload) });

    expect(facts.attestationScope).toBe('guest-desktop-service-readiness');
    expect(facts.prerequisiteRuntimeEvidenceId).toBe(runtimeEvidenceId);
    expect(facts.planHash).toBe(auth.planHash);
    expect(facts.limitations.join(' ')).toContain('RFB/VNC');
  });

  it('rejects a stored guest payload whose prerequisite evidence ID does not match', () => {
    const auth = authorization();
    const runtime = runtimeFacts();
    const payload = buildGuestServiceReadinessPayload({ authorization: auth, runtimeFacts: runtime, inspection: inspection() });

    expect(() => buildGuestServiceReadinessFacts({
      authorization: auth,
      runtimeFacts: runtime,
      evidence: evidence({ ...payload, prerequisiteRuntimeEvidenceId: '88888888-8888-4888-8888-888888888888' }),
    })).toThrowError(GuestServiceReadinessInterpretationError);
  });
});
