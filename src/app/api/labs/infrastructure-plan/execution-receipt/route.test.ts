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
  getDeploymentAuthorizationById: vi.fn(),
  claimDeploymentExecutionReceipt: vi.fn(),
}));

class MockDeploymentAuthorizationConflictError extends Error {}

vi.mock('@/lib/auth/middleware', () => ({ requireAuth: mocks.requireAuth }));
vi.mock('@/lib/security/csrf', () => ({ validateCsrfToken: mocks.validateCsrfToken }));
vi.mock('@/lib/security/rate-limit', () => ({ checkRateLimit: mocks.checkRateLimit }));
vi.mock('@/lib/infrastructure/designer-persistence', () => ({ getInfrastructureDesign: mocks.getInfrastructureDesign }));
vi.mock('@/lib/infrastructure/deployment-authorization', () => ({
  getDeploymentAuthorizationById: mocks.getDeploymentAuthorizationById,
  claimDeploymentExecutionReceipt: mocks.claimDeploymentExecutionReceipt,
  DeploymentAuthorizationConflictError: MockDeploymentAuthorizationConflictError,
}));

import { POST } from './route';

const user = { id: 'user-1', role: 'user' as const };
const authorizationId = '4a2e2dc5-b9b5-41b7-8c29-01f565231301';
const updatedAt = '2026-09-06T00:10:00.000Z';

function validDesign(): InfrastructureDesign {
  return {
    version: 1,
    nodes: [
      {
        id: 'server-1',
        type: 'infrastructure',
        position: { x: 0, y: 0 },
        data: {
          kind: 'server',
          label: 'Ubuntu Server',
          runtimeProfile: {
            profileId: 'ubuntu-24-04',
            architecture: 'x86_64',
            resourceClass: 'lab-small',
            accessMode: 'terminal',
          },
        },
      },
    ],
    edges: [],
  };
}

function request(body: unknown) {
  return new NextRequest('http://localhost/api/labs/infrastructure-plan/execution-receipt', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'content-type': 'application/json' },
  });
}

describe('POST /api/labs/infrastructure-plan/execution-receipt', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireAuth.mockImplementation(async (
      req: NextRequest,
      handler: (req: NextRequest, currentUser: typeof user) => Promise<NextResponse>
    ) => handler(req, user));
    mocks.validateCsrfToken.mockResolvedValue(true);
    mocks.checkRateLimit.mockResolvedValue(null);

    const plan = compileDeploymentPlan(validDesign());
    const identity = getDeploymentPlanIdentity(plan);
    const support = evaluateDeploymentExecutionSupport(plan);
    mocks.getInfrastructureDesign.mockResolvedValue({ design: validDesign(), updatedAt });
    mocks.getDeploymentAuthorizationById.mockResolvedValue({
      id: authorizationId,
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
    mocks.claimDeploymentExecutionReceipt.mockResolvedValue({
      executionId: 'c311694f-2b48-4274-b8ef-c56b4e2927e0',
      authorizationId,
      planId: identity.planId,
      planHash: identity.planHash,
      adapter: 'existing-lab-vm',
      target: {
        nodeId: 'server-1',
        labSlug: 'ubuntu-security-lab',
        accessMode: 'terminal',
      },
      issuedAt: '2026-09-06T00:11:00.000Z',
    });
  });

  it('keeps authentication as the outer boundary', async () => {
    mocks.requireAuth.mockResolvedValue(NextResponse.json({ error: 'Unauthorized' }, { status: 401 }));

    const response = await POST(request({ authorizationId }));

    expect(response.status).toBe(401);
    expect(mocks.validateCsrfToken).not.toHaveBeenCalled();
    expect(mocks.getDeploymentAuthorizationById).not.toHaveBeenCalled();
  });

  it('rejects invalid authorization identifiers before reading state', async () => {
    const response = await POST(request({ authorizationId: 'not-a-uuid' }));

    expect(response.status).toBe(400);
    expect(mocks.getDeploymentAuthorizationById).not.toHaveBeenCalled();
  });

  it('refuses a receipt when the design changed after authorization', async () => {
    mocks.getInfrastructureDesign.mockResolvedValue({
      design: validDesign(),
      updatedAt: '2026-09-06T00:12:00.000Z',
    });

    const response = await POST(request({ authorizationId }));
    const body = await response.json();

    expect(response.status).toBe(409);
    expect(body.error).toContain('design changed');
    expect(mocks.claimDeploymentExecutionReceipt).not.toHaveBeenCalled();
  });

  it('issues a one-time receipt without starting infrastructure execution', async () => {
    const response = await POST(request({ authorizationId }));
    const body = await response.json();

    expect(response.status).toBe(201);
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(mocks.claimDeploymentExecutionReceipt).toHaveBeenCalledWith(user.id, authorizationId);
    expect(body.receipt.executionId).toMatch(/^[0-9a-f-]{36}$/);
    expect(body.receipt.adapter).toBe('existing-lab-vm');
    expect(body.executionStarted).toBe(false);
    expect(body.message).toContain('No infrastructure has been created or changed');
  });
});
