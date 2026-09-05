import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';
import type { InfrastructureDesign } from '@/lib/infrastructure/designer-schema';

const mocks = vi.hoisted(() => ({
  requireAuth: vi.fn(),
  validateCsrfToken: vi.fn(),
  checkRateLimit: vi.fn(),
  getInfrastructureDesign: vi.fn(),
}));

vi.mock('@/lib/auth/middleware', () => ({ requireAuth: mocks.requireAuth }));
vi.mock('@/lib/security/csrf', () => ({ validateCsrfToken: mocks.validateCsrfToken }));
vi.mock('@/lib/security/rate-limit', () => ({ checkRateLimit: mocks.checkRateLimit }));
vi.mock('@/lib/infrastructure/designer-persistence', () => ({ getInfrastructureDesign: mocks.getInfrastructureDesign }));

import { POST } from './route';

const user = { id: 'user-1', role: 'user' as const };

function request() {
  return new NextRequest('http://localhost/api/labs/infrastructure-plan', { method: 'POST' });
}

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
          label: 'Server-01',
          hostname: 'dc01.lab.local',
          ipv4: '10.0.0.10',
          cidr: '10.0.0.0/24',
          gateway: '10.0.0.1',
          role: 'AD DS + DNS',
        },
      },
    ],
    edges: [],
  };
}

describe('POST /api/labs/infrastructure-plan', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireAuth.mockImplementation(async (
      req: NextRequest,
      handler: (req: NextRequest, currentUser: typeof user) => Promise<NextResponse>
    ) => handler(req, user));
    mocks.validateCsrfToken.mockResolvedValue(true);
    mocks.checkRateLimit.mockResolvedValue(null);
    mocks.getInfrastructureDesign.mockResolvedValue({
      design: validDesign(),
      updatedAt: '2026-09-06T00:00:00.000Z',
    });
  });

  it('keeps authentication as the outer boundary', async () => {
    mocks.requireAuth.mockResolvedValue(NextResponse.json({ error: 'Unauthorized' }, { status: 401 }));

    const response = await POST(request());

    expect(response.status).toBe(401);
    expect(mocks.validateCsrfToken).not.toHaveBeenCalled();
    expect(mocks.getInfrastructureDesign).not.toHaveBeenCalled();
  });

  it('requires CSRF before reading the saved blueprint', async () => {
    mocks.validateCsrfToken.mockResolvedValue(false);

    const response = await POST(request());

    expect(response.status).toBe(403);
    expect(mocks.checkRateLimit).not.toHaveBeenCalled();
    expect(mocks.getInfrastructureDesign).not.toHaveBeenCalled();
  });

  it('honors the shared per-user rate limit', async () => {
    mocks.checkRateLimit.mockResolvedValue(NextResponse.json({ error: 'Too many requests' }, { status: 429 }));

    const response = await POST(request());

    expect(response.status).toBe(429);
    expect(mocks.checkRateLimit).toHaveBeenCalledWith(
      expect.any(NextRequest),
      { maxRequests: 20, windowMs: 60_000 },
      user.id
    );
    expect(mocks.getInfrastructureDesign).not.toHaveBeenCalled();
  });

  it('requires a persisted design', async () => {
    mocks.getInfrastructureDesign.mockResolvedValue(null);

    const response = await POST(request());

    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({
      error: 'Save an infrastructure design before generating a deployment plan',
    });
  });

  it('refuses to plan a design with semantic validation errors', async () => {
    const invalid = validDesign();
    invalid.nodes.push({
      id: 'client-1',
      type: 'infrastructure',
      position: { x: 200, y: 0 },
      data: {
        kind: 'client',
        label: 'Client-01',
        ipv4: '10.0.0.10',
        cidr: '10.0.0.0/24',
      },
    });
    invalid.edges.push({ id: 'edge-1', source: 'server-1', target: 'client-1' });
    mocks.getInfrastructureDesign.mockResolvedValue({ design: invalid, updatedAt: '2026-09-06T00:00:00.000Z' });

    const response = await POST(request());
    const body = await response.json();

    expect(response.status).toBe(409);
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(body.validation.errors.some((issue: { code: string }) => issue.code === 'duplicate-ipv4')).toBe(true);
  });

  it('returns a stable plan identity and a no-store proposal without executing anything', async () => {
    const first = await POST(request());
    const firstBody = await first.json();
    const second = await POST(request());
    const secondBody = await second.json();

    expect(first.status).toBe(200);
    expect(first.headers.get('cache-control')).toBe('no-store');
    expect(firstBody.planId).toMatch(/^plan_[0-9a-f]{24}$/);
    expect(firstBody.planHash).toMatch(/^[0-9a-f]{64}$/);
    expect(firstBody.planId).toBe(secondBody.planId);
    expect(firstBody.planHash).toBe(secondBody.planHash);
    expect(firstBody.sourceDesignUpdatedAt).toBe('2026-09-06T00:00:00.000Z');
    expect(firstBody.plan.summary.workloads).toBe(1);
    expect(firstBody.plan.readiness.executable).toBe(false);
    expect(firstBody.plan.readiness.blockers.join(' ')).toContain('proposal-only');
  });
});
