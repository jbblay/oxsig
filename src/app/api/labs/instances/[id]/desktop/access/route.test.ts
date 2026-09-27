import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const mocks = vi.hoisted(() => ({
  requireAuth: vi.fn(),
  validateCsrfToken: vi.fn(),
  checkRateLimit: vi.fn(),
  query: vi.fn(),
  executeLabCommand: vi.fn(),
  logAudit: vi.fn(),
  ssmSend: vi.fn(),
}));

vi.mock('@aws-sdk/client-ssm', () => ({
  SSMClient: class { send = mocks.ssmSend; },
  PutParameterCommand: class { constructor(readonly input: unknown) {} },
  DeleteParameterCommand: class { constructor(readonly input: unknown) {} },
}));
vi.mock('@/lib/aws/client-config', () => ({ awsClientConfig: () => ({}) }));
vi.mock('@/lib/auth/middleware', () => ({ requireAuth: mocks.requireAuth }));
vi.mock('@/lib/security/csrf', () => ({ validateCsrfToken: mocks.validateCsrfToken }));
vi.mock('@/lib/security/rate-limit', () => ({ checkRateLimit: mocks.checkRateLimit }));
vi.mock('@/lib/db/pool', () => ({ getPool: () => ({ query: mocks.query }) }));
vi.mock('@/lib/labs/aws-runtime', () => ({ executeLabCommand: mocks.executeLabCommand }));
vi.mock('@/lib/audit/logger', () => ({ getRequestMetadata: () => ({}), logAudit: mocks.logAudit }));

import { POST } from './route';

const id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const user = { id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', clerkUserId: 'clerk-user' };
const request = () => new NextRequest(`http://localhost/api/labs/instances/${id}/desktop/access`, { method: 'POST' });
const context = { params: Promise.resolve({ id }) };

describe('Windows desktop login issuance', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireAuth.mockImplementation(async (req: NextRequest, handler: any) => handler(req, user));
    mocks.validateCsrfToken.mockResolvedValue(true);
    mocks.checkRateLimit.mockResolvedValue(null);
    mocks.query.mockResolvedValue({ rows: [{
      status: 'running', runtime_provider: 'aws-ec2',
      runtime_external_id: 'i-0123456789abcdef0',
      expires_at: '2099-01-01T00:00:00.000Z',
      metadata: { platform: 'windows', accessMode: 'desktop' },
    }] });
    mocks.executeLabCommand.mockResolvedValue({ exitCode: 0, stdout: 'OXSIG_USER=Administrator\n', stderr: '' });
    mocks.ssmSend.mockResolvedValue({});
  });

  it('issues a fresh password through SSM only for an owned running Windows desktop', async () => {
    const response = await POST(request(), context);
    const body = await response.json();
    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toContain('no-store');
    expect(body.username).toBe('Administrator');
    expect(body.password).toMatch(/^Ox!7[0-9a-f]{40}$/);
    expect(mocks.query).toHaveBeenCalledWith(expect.stringContaining('owner_id=$2'), [id, user.id]);
    expect(mocks.ssmSend).toHaveBeenCalledWith(expect.objectContaining({
      input: expect.objectContaining({ Value: body.password, Type: 'SecureString' }),
    }));
    expect(mocks.executeLabCommand).toHaveBeenCalledWith(
      'i-0123456789abcdef0',
      expect.stringContaining('Get-SSMParameter'),
      'windows',
      { maxAttempts: 115 }
    );
    expect(mocks.executeLabCommand.mock.calls[0][1]).not.toContain(body.password);
    expect(mocks.executeLabCommand.mock.calls[0][1]).toContain("throw 'Desktop request expired'");
    expect(mocks.ssmSend.mock.calls[1][0].input).toEqual({
      Name: mocks.ssmSend.mock.calls[0][0].input.Name,
    });
    expect(mocks.logAudit).toHaveBeenCalledWith(expect.not.objectContaining({ password: body.password }));
  });

  it('never touches SSM for another owner or a managed Operation', async () => {
    mocks.query.mockResolvedValueOnce({ rows: [] }).mockResolvedValueOnce({ rows: [{
      status: 'running', runtime_provider: 'aws-ec2', runtime_external_id: 'i-0123456789abcdef0',
      metadata: { platform: 'windows', accessMode: 'desktop', operationRunId: id },
    }] });
    expect((await POST(request(), context)).status).toBe(404);
    expect((await POST(request(), context)).status).toBe(409);
    expect(mocks.executeLabCommand).not.toHaveBeenCalled();
    expect(mocks.ssmSend).not.toHaveBeenCalled();
  });

  it('does not return a password if the guest command fails', async () => {
    mocks.executeLabCommand.mockResolvedValueOnce({ exitCode: 1, stdout: '', stderr: 'sensitive guest detail' });
    const response = await POST(request(), context);
    expect(response.status).toBe(503);
    expect(JSON.stringify(await response.json())).not.toContain('sensitive guest detail');
  });

  it('keeps the temporary parameter until expiration if SSM polling times out', async () => {
    mocks.executeLabCommand.mockRejectedValueOnce(new Error('The lab command did not finish before the request timeout'));
    const response = await POST(request(), context);
    expect(response.status).toBe(503);
    expect(mocks.ssmSend).toHaveBeenCalledTimes(1);
    expect(mocks.ssmSend.mock.calls[0][0].input).toEqual(expect.objectContaining({
      Type: 'SecureString', Tier: 'Advanced',
    }));
  });
});
