import { describe, expect, it, vi } from 'vitest';
import type { AccessPathReadinessEvidenceRecord } from '@/lib/execution-evidence/access-path-readiness';
import type { GuestServiceReadinessEvidenceRecord } from '@/lib/execution-evidence/guest-service-readiness';
import type { DesktopAccessEvidenceTicketClaims } from '@/lib/labs/desktop-access-evidence-ticket';
import type { DeploymentAuthorizationRecord } from './deployment-authorization';
import type { GuestServiceReadinessFacts } from './guest-service-readiness-evidence';

vi.mock('server-only', () => ({}));

import {
  AccessPathReadinessInterpretationError,
  buildAccessPathReadinessFacts,
  buildAccessPathReadinessPayload,
} from './access-path-readiness-evidence';

const authorizationId = '11111111-1111-4111-8111-111111111111';
const deploymentExecutionId = '22222222-2222-4222-8222-222222222222';
const labInstanceId = '33333333-3333-4333-8333-333333333333';
const runtimeEvidenceId = '44444444-4444-4444-8444-444444444444';
const guestEvidenceId = '55555555-5555-4555-8555-555555555555';
const accessEvidenceId = '66666666-6666-4666-8666-666666666666';
const accessExecutionId = '77777777-7777-4777-8777-777777777777';

function authorization(): DeploymentAuthorizationRecord {
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
          accessMode: 'desktop',
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
      target: { nodeId: 'server-1', labSlug: 'ubuntu-server', accessMode: 'desktop' },
    },
    state: 'analyzed',
    executionId: deploymentExecutionId,
    labInstanceId,
    expiresAt: '2099-09-06T02:00:00.000Z',
    createdAt: '2026-09-06T01:00:00.000Z',
    updatedAt: '2026-09-06T01:10:00.000Z',
  };
}

function guestPayload() {
  return {
    version: 1 as const,
    authorizationId,
    deploymentExecutionId,
    planId: 'plan_123',
    planHash: 'a'.repeat(64),
    labInstanceId,
    prerequisiteRuntimeEvidenceId: runtimeEvidenceId,
    target: { nodeId: 'server-1', labSlug: 'ubuntu-server', accessMode: 'desktop' as const },
    guest: {
      provenance: 'server-executed' as const,
      observationPath: 'aws-ssm-run-command' as const,
      platform: 'linux' as const,
      serviceName: 'oxsig-desktop-vnc.service',
      expectedPort: 5901,
      serviceInstalled: true,
      serviceState: 'active',
      serviceRunning: true,
      readyMarkerPresent: true,
      listenerPresent: true,
      listenerAddress: '127.0.0.1:5901',
      loopbackOnly: true,
      commandExitCode: 0,
    },
    readiness: {
      managementReady: true as const,
      guestServiceReady: true,
      requestedAccessReady: true,
      state: 'ready' as const,
    },
    checkedAt: '2026-09-06T01:30:00.000Z',
  };
}

function guestEvidence(payload: Record<string, unknown> = guestPayload()): GuestServiceReadinessEvidenceRecord {
  return {
    id: guestEvidenceId,
    ownerId: 'user-1',
    labInstanceId,
    deploymentAuthorizationId: authorizationId,
    executionId: '88888888-8888-4888-8888-888888888888',
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

function ticket(overrides: Partial<DesktopAccessEvidenceTicketClaims> = {}): DesktopAccessEvidenceTicketClaims {
  return {
    v: 1,
    ownerId: 'user-1',
    labInstanceId,
    deploymentAuthorizationId: authorizationId,
    deploymentExecutionId,
    planId: 'plan_123',
    planHash: 'a'.repeat(64),
    prerequisiteGuestEvidenceId: guestEvidenceId,
    sessionId: 'session-1',
    target: 'i-0123456789abcdef0',
    platform: 'linux',
    port: 5901,
    evidenceExecutionId: accessExecutionId,
    nonce: 'nonce',
    iat: Date.parse('2026-09-06T01:40:00.000Z'),
    exp: Date.parse('2026-09-06T01:42:00.000Z'),
    ...overrides,
  };
}

const observation = {
  ssmChannelReady: true as const,
  rfbHandshakeComplete: true as const,
  rfbProtocolVersion: 'RFB 003.008',
  desktopName: 'OXSIG Desktop',
  framebuffer: { width: 1440, height: 900 },
};

function accessEvidence(payload: Record<string, unknown>): AccessPathReadinessEvidenceRecord {
  return {
    id: accessEvidenceId,
    ownerId: 'user-1',
    labInstanceId,
    deploymentAuthorizationId: authorizationId,
    executionId: accessExecutionId,
    source: 'access-path-readiness',
    surface: 'browser-desktop',
    provenance: 'browser-observed',
    state: 'evidence_recorded',
    payload,
    evidenceRecordedAt: '2026-09-06T01:41:00.000Z',
    createdAt: '2026-09-06T01:41:00.000Z',
    updatedAt: '2026-09-06T01:41:00.000Z',
  };
}

describe('browser desktop access-path evidence contract', () => {
  it('keeps aggregate provenance browser-observed while preserving the server-issued session subfact', () => {
    const payload = buildAccessPathReadinessPayload({
      authorization: authorization(),
      guestEvidence: guestEvidence(),
      ticket: ticket(),
      observation,
      receivedAt: '2026-09-06T01:41:00.000Z',
    });

    expect(payload.session.provenance).toBe('server-executed');
    expect(payload.browser.provenance).toBe('browser-observed');
    expect(payload.readiness).toEqual({
      guestServiceReady: true,
      ssmSessionIssued: true,
      rfbHandshakeObserved: true,
      browserDesktopPathReady: true,
      state: 'ready',
    });
    expect(payload.prerequisiteGuestEvidenceId).toBe(guestEvidenceId);
  });

  it('rejects a ticket bound to a different plan or guest prerequisite', () => {
    expect(() => buildAccessPathReadinessPayload({
      authorization: authorization(),
      guestEvidence: guestEvidence(),
      ticket: ticket({ planHash: 'b'.repeat(64) }),
      observation,
    })).toThrowError(AccessPathReadinessInterpretationError);

    expect(() => buildAccessPathReadinessPayload({
      authorization: authorization(),
      guestEvidence: guestEvidence(),
      ticket: ticket({ prerequisiteGuestEvidenceId: '99999999-9999-4999-8999-999999999999' }),
      observation,
    })).toThrowError(AccessPathReadinessInterpretationError);
  });

  it('rejects a guest-service prerequisite that is not ready', () => {
    const payload = guestPayload();
    payload.readiness.guestServiceReady = false;
    payload.readiness.requestedAccessReady = false;
    payload.readiness.state = 'not-ready';

    expect(() => buildAccessPathReadinessPayload({
      authorization: authorization(),
      guestEvidence: guestEvidence(payload),
      ticket: ticket(),
      observation,
    })).toThrowError(AccessPathReadinessInterpretationError);
  });

  it('reconstructs stored facts without upgrading browser evidence into provider attestation', () => {
    const auth = authorization();
    const payload = buildAccessPathReadinessPayload({
      authorization: auth,
      guestEvidence: guestEvidence(),
      ticket: ticket(),
      observation,
      receivedAt: '2026-09-06T01:41:00.000Z',
    });
    const guestFacts = {
      evidenceId: guestEvidenceId,
    } as GuestServiceReadinessFacts;

    const facts = buildAccessPathReadinessFacts({
      authorization: auth,
      guestFacts,
      evidence: accessEvidence(payload),
    });

    expect(facts.provenance).toBe('browser-observed');
    expect(facts.attestationScope).toBe('browser-desktop-access-path');
    expect(facts.browser.rfbHandshakeComplete).toBe(true);
    expect(facts.workload.label).toBe('Desktop learning server');
    expect(facts.limitations.join(' ')).toContain('browser-observed');
  });
});
