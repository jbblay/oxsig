import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ send: vi.fn() }));

vi.mock('server-only', () => ({}));
vi.mock('@aws-sdk/client-ec2', async () => {
  const actual = await vi.importActual<any>('@aws-sdk/client-ec2');
  return { ...actual, EC2Client: class EC2Client { send = mocks.send; } };
});

describe('Operation AWS network readiness', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    vi.unstubAllEnvs();
    vi.stubEnv('LAB_AWS_ENABLED', 'true');
    vi.stubEnv('LAB_AWS_SUBNET_ID', 'subnet-123');
    vi.stubEnv('LAB_AWS_SECURITY_GROUP_ID', 'sg-123');
    vi.stubEnv('LAB_AWS_INSTANCE_PROFILE', 'oxsig-lab');
  });

  it('requires an internally connected security group for multi-node scenarios', async () => {
    mocks.send
      .mockResolvedValueOnce({ Subnets: [{ VpcId: 'vpc-1', CidrBlock: '10.0.1.0/24' }] })
      .mockResolvedValueOnce({ SecurityGroups: [{ GroupId: 'sg-123', VpcId: 'vpc-1', IpPermissions: [] }] });
    const { assertOperationRuntimeReady } = await import('./runtime');
    await expect(assertOperationRuntimeReady()).rejects.toMatchObject({ code: 'OPERATION_INTERNAL_NETWORK_BLOCKED', status: 503 });
  });

  it('accepts a same-VPC security group that permits internal all-protocol traffic', async () => {
    mocks.send
      .mockResolvedValueOnce({ Subnets: [{ VpcId: 'vpc-1', CidrBlock: '10.0.1.0/24' }] })
      .mockResolvedValueOnce({ SecurityGroups: [{
        GroupId: 'sg-123',
        VpcId: 'vpc-1',
        IpPermissions: [{ IpProtocol: '-1', UserIdGroupPairs: [{ GroupId: 'sg-123' }] }],
      }] });
    const { assertOperationRuntimeReady } = await import('./runtime');
    await expect(assertOperationRuntimeReady()).resolves.toMatchObject({ subnetId: 'subnet-123', securityGroupId: 'sg-123' });
  });
});
