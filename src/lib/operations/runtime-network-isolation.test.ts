import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  send: vi.fn(),
}));

vi.mock('server-only', () => ({}));
vi.mock('@aws-sdk/client-ec2', async () => {
  const actual = await vi.importActual<any>('@aws-sdk/client-ec2');
  return { ...actual, EC2Client: class EC2Client { send = mocks.send; } };
});

describe('disposable Operation run network isolation', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    vi.unstubAllEnvs();
    vi.stubEnv('OXSIG_TERMINAL_BRIDGE_SECRET', 'test-operation-secret-0123456789abcdef0123456789abcdef');
  });

  it('creates a unique security group with self-only ingress for one run', async () => {
    mocks.send
      .mockResolvedValueOnce({ GroupId: 'sg-run-123' })
      .mockResolvedValueOnce({});

    const { createDisposableOperationSecurityGroup } = await import('./runtime');
    const groupId = await createDisposableOperationSecurityGroup({
      vpcId: 'vpc-123',
      runId: '11111111-2222-3333-4444-555555555555',
      ownerId: 'owner-1',
      expiresAt: '2026-09-15T12:00:00.000Z',
    });

    expect(groupId).toBe('sg-run-123');
    expect(mocks.send).toHaveBeenCalledTimes(2);

    const createCommand = mocks.send.mock.calls[0][0];
    expect(createCommand.constructor.name).toBe('CreateSecurityGroupCommand');
    expect(createCommand.input).toMatchObject({
      VpcId: 'vpc-123',
      GroupName: 'oxsig-operation-11111111-2222-3333-4444-555555555555',
    });
    expect(createCommand.input.TagSpecifications?.[0]?.Tags).toEqual(expect.arrayContaining([
      { Key: 'Purpose', Value: 'OperationRun' },
      { Key: 'Lifecycle', Value: 'Disposable' },
      { Key: 'OperationRunId', Value: '11111111-2222-3333-4444-555555555555' },
      { Key: 'OwnerId', Value: 'owner-1' },
    ]));

    const ingressCommand = mocks.send.mock.calls[1][0];
    expect(ingressCommand.constructor.name).toBe('AuthorizeSecurityGroupIngressCommand');
    expect(ingressCommand.input.GroupId).toBe('sg-run-123');
    expect(ingressCommand.input.IpPermissions).toEqual([
      {
        IpProtocol: '-1',
        UserIdGroupPairs: [{
          GroupId: 'sg-run-123',
          Description: 'OXSIG same-run east-west traffic only',
        }],
      },
    ]);
    expect(ingressCommand.input.IpPermissions?.[0]?.IpRanges).toBeUndefined();
    expect(ingressCommand.input.IpPermissions?.[0]?.Ipv6Ranges).toBeUndefined();
  });

  it('deletes the new group and fails closed if self-only ingress cannot be installed', async () => {
    mocks.send
      .mockResolvedValueOnce({ GroupId: 'sg-run-failed' })
      .mockRejectedValueOnce(new Error('authorize denied'))
      .mockResolvedValueOnce({});

    const { createDisposableOperationSecurityGroup } = await import('./runtime');
    await expect(createDisposableOperationSecurityGroup({
      vpcId: 'vpc-123',
      runId: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
      ownerId: 'owner-2',
      expiresAt: '2026-09-15T12:00:00.000Z',
    })).rejects.toMatchObject({
      code: 'OPERATION_NETWORK_CREATE_FAILED',
      status: 503,
    });

    expect(mocks.send).toHaveBeenCalledTimes(3);
    const deleteCommand = mocks.send.mock.calls[2][0];
    expect(deleteCommand.constructor.name).toBe('DeleteSecurityGroupCommand');
    expect(deleteCommand.input).toEqual({ GroupId: 'sg-run-failed' });
  });
});
