import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';

const mocks = vi.hoisted(() => ({
  requireAuth: vi.fn(),
  validateCsrfToken: vi.fn(),
  checkRateLimit: vi.fn(),
  getInfrastructureDesign: vi.fn(),
  saveInfrastructureDesign: vi.fn(),
}));

vi.mock('@/lib/auth/middleware', () => ({ requireAuth: mocks.requireAuth }));
vi.mock('@/lib/security/csrf', () => ({ validateCsrfToken: mocks.validateCsrfToken }));
vi.mock('@/lib/security/rate-limit', () => ({ checkRateLimit: mocks.checkRateLimit }));
vi.mock('@/lib/infrastructure/designer-persistence', () => ({
  getInfrastructureDesign: mocks.getInfrastructureDesign,
  saveInfrastructureDesign: mocks.saveInfrastructureDesign,
}));

import { GET, PUT } from './route';

const user = { id: 'user-1', role: 'user' as const };
const validDesign = {
  version: 1 as const,
  nodes: [{
    id: 'client-1',
    type: 'infrastructure' as const,
    position: { x: 10, y: 20 },
    data: { kind: 'client' as const, label: 'Client-01', ipv4: '10.0.0.10', cidr: '10.0.0.0/24' },
  }],
  edges: [],
};

function request(method: 'GET' | 'PUT', body?: unknown) {
  return new NextRequest('http://localhost/api/labs/infrastructure-design', {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
}

describe('/api/labs/infrastructure-design', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireAuth.mockImplementation(async (
      req: NextRequest,
      handler: (req: NextRequest, user: typeof user) => Promise<NextResponse>
    ) => handler(req, user));
    mocks.validateCsrfToken.mockResolvedValue(true);
    mocks.checkRateLimit.mockResolvedValue(null);
    mocks.getInfrastructureDesign.mockResolvedValue(null);
    mocks.saveInfrastructureDesign.mockResolvedValue({ design: validDesign, updatedAt: '2026-09-05T00:00:00.000Z' });
  });

  it('keeps authentication as the outer boundary', async () => {
    mocks.requireAuth.mockResolvedValue(NextResponse.json({ error: 'Unauthorized' }, { status: 401 }));
    const response = await GET(request('GET'));
    expect(response.status).toBe(401);
    expect(mocks.checkRateLimit).not.toHaveBeenCalled();
    expect(mocks.getInfrastructureDesign).not.toHaveBeenCalled();
  });

  it('loads the authenticated user design with no-store semantics', async () => {
    mocks.getInfrastructureDesign.mockResolvedValue({ design: validDesign, updatedAt: '2026-09-05T00:00:00.000Z' });
    const response = await GET(request('GET'));
    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(mocks.getInfrastructureDesign).toHaveBeenCalledWith(user.id);
    expect((await response.json()).design).toEqual(validDesign);
  });

  it('rejects writes that fail CSRF validation', async () => {
    mocks.validateCsrfToken.mockResolvedValue(false);
    const response = await PUT(request('PUT', validDesign));
    expect(response.status).toBe(403);
    expect(mocks.checkRateLimit).not.toHaveBeenCalled();
    expect(mocks.saveInfrastructureDesign).not.toHaveBeenCalled();
  });

  it('rejects invalid design documents before persistence', async () => {
    const response = await PUT(request('PUT', { version: 1, nodes: [{ nope: true }], edges: [] }));
    expect(response.status).toBe(400);
    expect(mocks.saveInfrastructureDesign).not.toHaveBeenCalled();
  });

  it('rate limits and persists a validated design for the authenticated owner', async () => {
    const response = await PUT(request('PUT', validDesign));
    expect(response.status).toBe(200);
    expect(mocks.checkRateLimit).toHaveBeenCalledWith(expect.any(NextRequest), { maxRequests: 30, windowMs: 60_000 }, user.id);
    expect(mocks.saveInfrastructureDesign).toHaveBeenCalledWith(user.id, validDesign);
  });
});
