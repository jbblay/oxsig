import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';
import type { InfrastructureDesign } from '@/lib/infrastructure/designer-schema';
import { compileDeploymentPlan } from '@/lib/infrastructure/deployment-plan-compiler';
import { evaluateDeploymentExecutionSupport } from '@/lib/infrastructure/deployment-execution-support';
import { getDeploymentPlanIdentity } from '@/lib/infrastructure/deployment-plan-identity';

const mocks = vi.hoisted(() => ({
  requireAuth: vi.fn(),
  validateCsrfToken: vi.fn(),
  checkRateLimit: vi.fn(),
  getInfrastructureDesign: vi.fn(),
  createDeploymentAuthorization: vi.fn(),
}));

vi.mock('@/lib/auth/middleware', () => ({ requireAuth: mocks.requireAuth }));
vi.mock('@/lib/security/csrf', () => ({ validateCsrfToken: mocks.validateCsrfToken }));
vi.mock('@/lib/security/rate-limit', () => ({ checkRateLimit: mocks.checkRateLimit }));
vi.mock('@/lib/infrastructure/designer-persistence', () => ({ getInfrastructureDesign: mocks.getInfrastructureDesign }));
vi.mock('@/lib/infrastructure/deployment-authorization', () => ({
  createDeploymentAuthorization: mocks.createDeploymentAuthorization,
  DeploymentAuthorizationConflictError: class DeploymentAuthorizationConflictError extends Error {},
}));

import { POST } from './route';

const user = { id: 'user-1', role: 'user' as const };
const updatedAt = '2026-09-06T00:10:00.000Z';

function ubuntuNode(id: string, x = 0): InfrastructureDesign['nodes'][number] {
  return {
    id,
    type: 'infrastructure',
    position: { x, y: 0 },
    data: {
      kind: 'server',
      label: id === 'server-1' ? 'Ubuntu Server' : 'Ubuntu Peer',
      runtimeProfile: {
        profileId: 'ubuntu-24-04',
        architecture: 'x86_64',
        resourceClass: 'lab-small',
        accessMode: 'terminal',
      },
    },
  };
}

function validDesign(): InfrastructureDesign {
  return {
    version: 1,
    nodes: [ubuntuNode('server-1')],
    edges: [],
  };
}

function unsupportedDesign(): InfrastructureDesign {
  return {
    version: 1,
    nodes: [ubuntuNode('server-1'), ubuntuNode('server-2', 200)],
    edges: [{ id: 'edge-1', source: 'server-1', target: 'server-2' }],
  };
}

function request(body: unknown) {
  return new NextRequest('http://localhost/api/labs/infrastructure-plan/authorize', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'content-type': 'application/json' },
  });
}

describe('POST /api/labs/infrastructure-plan/authorize', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireAuth.mockImplementation(async (
      req: NextRequest,
      handler: (req: NextRequest, currentUser: typeof user) => Promise<NextResponse>
    ) => handler(req, user));
    mocks.validateCsrfToken.mockResolvedValue(true);
    mocks.checkRateLimit.mockResolvedValue(null);
    mocks.getInfrastructureDesign.mockResolvedValue({ design: validDesign(), updatedAt });

    const plan = compileDeploymentPlan(validDesign());
    const identity = getDeploymentPlanIdentity(plan);
    const support = evaluateDeploymentExecutionSupport(plan);
    mocks.createDeploymentAuthorization.mockResolvedValue({
      id: '4a2e2dc5-b9b5-41b7-8c29-01f565231301',
      ownerId: user.id,
      planId: identity.planId,
      planHash: identity.planHash,
      planSnapshot: plan,
      sourceDesignUpdatedAt: updatedAt,
      executionSupport: support,
      state: 'authorized',
      expiresAt: '2026-09-06T00:25:00.000Z',
      createdAt: updatedAt,
      updatedAt,
    });
  });

  it('keeps authentication as the outer boundary', async () => {
    mocks.requireAuth.mockResolvedValue(NextResponse.json({ error: 'Unauthorized' }, { status: 401 }));

    const response = await POST(request({ planHash: 'a'.repeat(64), confirm: true }));

    expect(response.status).toBe(401);
    expect(mocks.validateCsrfToken).not.toHaveBeenCalled();
    expect(mocks.getInfrastructureDesign).not.toHaveBeenCalled();
  });

  it('requires explicit confirmation and a valid plan hash', async () => {
    const response = await POST(request({ planHash: 'a'.repeat(64) }));

    expect(response.status).toBe(400);
    expect(mocks.getInfrastructureDesign).not.toHaveBeenCalled();
  });

  it('rejects a stale client plan hash after recompiling server-side', async () => {
    const response = await POST(request({ planHash: 'a'.repeat(64), confirm: true }));
    const body = await response.json();

    expect(response.status).toBe(409);
    expect(body.error).toContain('plan changed');
    expect(mocks.createDeploymentAuthorization).not.toHaveBeenCalled();
  });

  it('rejects a valid but unsupported topology before creating authorization state', async () => {
    const design = unsupportedDesign();
    mocks.getInfrastructureDesign.mockResolvedValue({ design, updatedAt });
    const plan = compileDeploymentPlan(design);
    const identity = getDeploymentPlanIdentity(plan);

    const response = await POST(request({ planHash: identity.planHash, confirm: true }));
    const body = await response.json();

    expect(response.status).toBe(409);
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(body.error).toContain('outside the current controlled execution adapter scope');
    expect(body.reasons.join(' ')).toContain('exactly one VM workload');
    expect(body.reasons.join(' ')).toContain('explicit topology links');
    expect(mocks.createDeploymentAuthorization).not.toHaveBeenCalled();
  });

  it('stores approval of the exact server-compiled supported plan without executing infrastructure', async () => {
    const plan = compileDeploymentPlan(validDesign());
    const identity = getDeploymentPlanIdentity(plan);

    const response = await POST(request({ planHash: identity.planHash, confirm: true }));
    const body = await response.json();

    expect(response.status).toBe(201);
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(mocks.createDeploymentAuthorization).toHaveBeenCalledWith(expect.objectContaining({
      ownerId: user.id,
      planId: identity.planId,
      planHash: identity.planHash,
      sourceDesignUpdatedAt: updatedAt,
      executionSupport: expect.objectContaining({ supported: true, adapter: 'existing-lab-vm' }),
    }));
    expect(body.authorization.state).toBe('authorized');
    expect(body.authorization.executionSupport.supported).toBe(true);
    expect(body.authorization).not.toHaveProperty('executionId');
  });
});
