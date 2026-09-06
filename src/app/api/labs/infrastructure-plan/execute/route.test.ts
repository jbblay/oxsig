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
  getDeploymentAuthorizationById: vi.fn(),
  getInfrastructureDesign: vi.fn(),
  executeControlledDeployment: vi.fn(),
  getRequestMetadata: vi.fn(),
}));

vi.mock('@/lib/auth/middleware', () => ({ requireAuth: mocks.requireAuth }));
vi.mock('@/lib/security/csrf', () => ({ validateCsrfToken: mocks.validateCsrfToken }));
vi.mock('@/lib/security/rate-limit', () => ({
  checkRateLimit: mocks.checkRateLimit,
  RATE_LIMITS: { LAB_PROVISION: { maxRequests: 2, windowMs: 3_600_000 } },
}));
vi.mock('@/lib/infrastructure/designer-persistence', () => ({ getInfrastructureDesign: mocks.getInfrastructureDesign }));
vi.mock('@/lib/infrastructure/deployment-authorization', () => ({ getDeploymentAuthorizationById: mocks.getDeploymentAuthorizationById }));
vi.mock('@/lib/infrastructure/controlled-deployment-executor', () => ({
  executeControlledDeployment: mocks.executeControlledDeployment,
  ControlledDeploymentExecutionError: class ControlledDeploymentExecutionError extends Error {},
}));
vi.mock('@/lib/audit/logger', () => ({ getRequestMetadata: mocks.getRequestMetadata }));

import { POST } from './route';

const user = { id: 'user-1', clerkUserId: 'clerk-1', role: 'user' as const };
const authorizationId = '4a2e2dc5-b9b5-41b7-8c29-01f565231301';
const executionId = 'c311694f-2b48-4274-b8ef-c56b4e2927e0';
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
  return new NextRequest('http://localhost/api/labs/infrastructure-plan/execute', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'content-type': 'application/json', 'user-agent': 'vitest' },
  });
}

describe('POST /api/labs/infrastructure-plan/execute', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireAuth.mockImplementation(async (
      req: NextRequest,
      handler: (req: NextRequest, currentUser: typeof user) => Promise<NextResponse>
    ) => handler(req, user));
    mocks.validateCsrfToken.mockResolvedValue(true);
    mocks.checkRateLimit.mockResolvedValue(null);
    mocks.getRequestMetadata.mockReturnValue({ userAgent: 'vitest' });

    const design = validDesign();
    const plan = compileDeploymentPlan(design);
    const identity = getDeploymentPlanIdentity(plan);
    const support = evaluateDeploymentExecutionSupport(plan);
    mocks.getInfrastructureDesign.mockResolvedValue({ design, updatedAt });
    mocks.getDeploymentAuthorizationById.mockResolvedValue({
      id: authorizationId,
      ownerId: user.id,
      planId: identity.planId,
      planHash: identity.planHash,
      planSnapshot: plan,
      sourceDesignUpdatedAt: updatedAt,
      executionSupport: support,
      state: 'receipt_issued',
      executionId,
      receiptIssuedAt: updatedAt,
      expiresAt: '2026-09-06T00:25:00.000Z',
      createdAt: updatedAt,
      updatedAt,
    });
    mocks.executeControlledDeployment.mockResolvedValue({
      instance: {
        id: 'lab-1',
        slug: 'ubuntu-security-lab',
        name: 'Ubuntu Security Lab',
        status: 'provisioning',
        lastError: null,
        createdAt: updatedAt,
        startedAt: null,
        expiresAt: '2026-09-06T01:10:00.000Z',
        metadata: {},
      },
      executionId,
      authorizationId,
      alreadyStarted: false,
    });
  });

  it('keeps authentication as the outer boundary', async () => {
    mocks.requireAuth.mockResolvedValue(NextResponse.json({ error: 'Unauthorized' }, { status: 401 }));

    const response = await POST(request({ authorizationId, executionId }));

    expect(response.status).toBe(401);
    expect(mocks.validateCsrfToken).not.toHaveBeenCalled();
    expect(mocks.executeControlledDeployment).not.toHaveBeenCalled();
  });

  it('applies ordinary abuse throttling before reading the receipt', async () => {
    const limited = NextResponse.json({ error: 'Too Many Requests' }, { status: 429 });
    mocks.checkRateLimit.mockResolvedValueOnce(limited);

    const response = await POST(request({ authorizationId, executionId }));

    expect(response.status).toBe(429);
    expect(mocks.checkRateLimit).toHaveBeenCalledTimes(1);
    expect(mocks.checkRateLimit).toHaveBeenCalledWith(
      expect.any(NextRequest),
      { maxRequests: 20, windowMs: 60_000 },
      user.id
    );
    expect(mocks.getDeploymentAuthorizationById).not.toHaveBeenCalled();
  });

  it('charges the shared cost-bearing bucket only after receipt and plan revalidation', async () => {
    const limited = NextResponse.json({ error: 'Too Many Requests' }, { status: 429 });
    mocks.checkRateLimit
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(limited);

    const response = await POST(request({ authorizationId, executionId }));

    expect(response.status).toBe(429);
    expect(mocks.getDeploymentAuthorizationById).toHaveBeenCalledWith(user.id, authorizationId);
    expect(mocks.getInfrastructureDesign).toHaveBeenCalledWith(user.id);
    expect(mocks.checkRateLimit).toHaveBeenNthCalledWith(
      2,
      expect.any(NextRequest),
      { maxRequests: 2, windowMs: 3_600_000 },
      user.id,
      'lab-provision'
    );
    expect(mocks.executeControlledDeployment).not.toHaveBeenCalled();
  });

  it('rejects an execution id that does not match the owner-bound authorization', async () => {
    const response = await POST(request({
      authorizationId,
      executionId: '11111111-1111-4111-8111-111111111111',
    }));

    expect(response.status).toBe(409);
    expect(mocks.executeControlledDeployment).not.toHaveBeenCalled();
  });

  it('refuses execution when the saved design changed after receipt issuance', async () => {
    mocks.getInfrastructureDesign.mockResolvedValue({
      design: validDesign(),
      updatedAt: '2026-09-06T00:12:00.000Z',
    });

    const response = await POST(request({ authorizationId, executionId }));
    const body = await response.json();

    expect(response.status).toBe(409);
    expect(body.error).toContain('design changed');
    expect(mocks.checkRateLimit).toHaveBeenCalledTimes(1);
    expect(mocks.executeControlledDeployment).not.toHaveBeenCalled();
  });

  it('starts only the revalidated controlled adapter and returns no-store runtime state', async () => {
    const response = await POST(request({ authorizationId, executionId }));
    const body = await response.json();

    expect(response.status).toBe(201);
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(mocks.checkRateLimit).toHaveBeenNthCalledWith(
      2,
      expect.any(NextRequest),
      { maxRequests: 2, windowMs: 3_600_000 },
      user.id,
      'lab-provision'
    );
    expect(mocks.executeControlledDeployment).toHaveBeenCalledWith(expect.objectContaining({
      ownerId: user.id,
      distinctId: user.clerkUserId,
      executionId,
      authorization: expect.objectContaining({ id: authorizationId, executionId }),
      auditRequestMetadata: { userAgent: 'vitest' },
    }));
    expect(body.executionStarted).toBe(true);
    expect(body.instance.slug).toBe('ubuntu-security-lab');
  });
});
