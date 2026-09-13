import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  send: vi.fn(),
  reconcileOwnedLabReadModel: vi.fn(),
}));

vi.mock('server-only', () => ({}));
vi.mock('@aws-sdk/client-ec2', async () => {
  const actual = await vi.importActual<any>('@aws-sdk/client-ec2');
  return { ...actual, EC2Client: class EC2Client { send = mocks.send; } };
});
vi.mock('@/lib/labs/reconciliation', () => ({
  reconcileOwnedLabReadModel: mocks.reconcileOwnedLabReadModel,
}));

describe('prepared Black Domain runtime', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    vi.unstubAllEnvs();
    mocks.reconcileOwnedLabReadModel.mockResolvedValue({
      checkedAt: new Date().toISOString(),
      reconciled: 0,
      failed: 0,
      cleanupRequested: 0,
      skipped: true,
      reason: 'nothing_to_reconcile',
    });
  });

  it('fails closed when the permanent slot configuration is incomplete', async () => {
    vi.stubEnv('LAB_AWS_BLACK_DOMAIN_DC_INSTANCE_ID', '');
    vi.stubEnv('LAB_AWS_BLACK_DOMAIN_WORKSTATION_INSTANCE_ID', '');
    vi.stubEnv('LAB_AWS_BLACK_DOMAIN_OPERATOR_INSTANCE_ID', '');
    vi.stubEnv('LAB_AWS_BLACK_DOMAIN_DC_SNAPSHOT_ID', '');
    vi.stubEnv('LAB_AWS_BLACK_DOMAIN_WORKSTATION_SNAPSHOT_ID', '');
    vi.stubEnv('LAB_AWS_BLACK_DOMAIN_OPERATOR_SNAPSHOT_ID', '');
    vi.stubEnv('LAB_AWS_BLACK_DOMAIN_INITIAL_PASSWORD', '');

    const { provisionPreparedBlackDomainRun } = await import('./prepared-runtime');
    await expect(provisionPreparedBlackDomainRun({
      pool: {} as any,
      ownerId: 'owner-1',
      slug: 'black-domain',
      mode: 'practice',
    })).rejects.toMatchObject({
      code: 'OPERATION_ENVIRONMENT_CONFIGURATION_INCOMPLETE',
      status: 503,
    });
    expect(mocks.send).not.toHaveBeenCalled();
  });

  it('requires the complete baseline snapshot set before starting a prepared run', async () => {
    vi.stubEnv('LAB_AWS_BLACK_DOMAIN_DC_INSTANCE_ID', 'i-00000000000000001');
    vi.stubEnv('LAB_AWS_BLACK_DOMAIN_WORKSTATION_INSTANCE_ID', 'i-00000000000000002');
    vi.stubEnv('LAB_AWS_BLACK_DOMAIN_OPERATOR_INSTANCE_ID', 'i-00000000000000003');
    vi.stubEnv('LAB_AWS_BLACK_DOMAIN_DC_SNAPSHOT_ID', 'snap-00000000000000001');
    vi.stubEnv('LAB_AWS_BLACK_DOMAIN_WORKSTATION_SNAPSHOT_ID', '');
    vi.stubEnv('LAB_AWS_BLACK_DOMAIN_OPERATOR_SNAPSHOT_ID', 'snap-00000000000000003');
    vi.stubEnv('LAB_AWS_BLACK_DOMAIN_INITIAL_PASSWORD', 'test-password');

    const { provisionPreparedBlackDomainRun } = await import('./prepared-runtime');
    await expect(provisionPreparedBlackDomainRun({
      pool: {} as any,
      ownerId: 'owner-1',
      slug: 'black-domain',
      mode: 'practice',
    })).rejects.toMatchObject({
      code: 'OPERATION_ENVIRONMENT_CONFIGURATION_INCOMPLETE',
      status: 503,
    });
    expect(mocks.send).not.toHaveBeenCalled();
  });

  it('validates EC2 slot state before opening a database transaction', async () => {
    vi.stubEnv('LAB_AWS_BLACK_DOMAIN_DC_INSTANCE_ID', 'i-00000000000000001');
    vi.stubEnv('LAB_AWS_BLACK_DOMAIN_WORKSTATION_INSTANCE_ID', 'i-00000000000000002');
    vi.stubEnv('LAB_AWS_BLACK_DOMAIN_OPERATOR_INSTANCE_ID', 'i-00000000000000003');
    vi.stubEnv('LAB_AWS_BLACK_DOMAIN_DC_SNAPSHOT_ID', 'snap-00000000000000001');
    vi.stubEnv('LAB_AWS_BLACK_DOMAIN_WORKSTATION_SNAPSHOT_ID', 'snap-00000000000000002');
    vi.stubEnv('LAB_AWS_BLACK_DOMAIN_OPERATOR_SNAPSHOT_ID', 'snap-00000000000000003');
    vi.stubEnv('LAB_AWS_BLACK_DOMAIN_INITIAL_PASSWORD', 'test-password');
    mocks.send.mockResolvedValueOnce({
      Reservations: [{ Instances: [
        { InstanceId: 'i-00000000000000001', PrivateIpAddress: '10.0.0.10', State: { Name: 'running' }, Tags: [] },
        { InstanceId: 'i-00000000000000002', PrivateIpAddress: '10.0.0.20', State: { Name: 'stopped' }, Tags: [] },
        { InstanceId: 'i-00000000000000003', PrivateIpAddress: '10.0.0.30', State: { Name: 'stopped' }, Tags: [] },
      ] }],
    });

    const { provisionPreparedBlackDomainRun } = await import('./prepared-runtime');
    await expect(provisionPreparedBlackDomainRun({
      pool: { query: vi.fn().mockResolvedValue({ rows: [] }), connect: vi.fn() } as any,
      ownerId: 'owner-1',
      slug: 'black-domain',
      mode: 'practice',
    })).rejects.toMatchObject({ code: 'OPERATION_ENVIRONMENT_BUSY', status: 409 });
    expect(mocks.reconcileOwnedLabReadModel).toHaveBeenCalledWith(expect.anything(), 'owner-1');
  });

  it('rejects a stopped instance that is not the expected reusable slot node', async () => {
    vi.stubEnv('LAB_AWS_BLACK_DOMAIN_SLOT_KEY', 'black-domain-slot-01');
    vi.stubEnv('LAB_AWS_BLACK_DOMAIN_DC_INSTANCE_ID', 'i-00000000000000001');
    vi.stubEnv('LAB_AWS_BLACK_DOMAIN_WORKSTATION_INSTANCE_ID', 'i-00000000000000002');
    vi.stubEnv('LAB_AWS_BLACK_DOMAIN_OPERATOR_INSTANCE_ID', 'i-00000000000000003');
    vi.stubEnv('LAB_AWS_BLACK_DOMAIN_DC_SNAPSHOT_ID', 'snap-00000000000000001');
    vi.stubEnv('LAB_AWS_BLACK_DOMAIN_WORKSTATION_SNAPSHOT_ID', 'snap-00000000000000002');
    vi.stubEnv('LAB_AWS_BLACK_DOMAIN_OPERATOR_SNAPSHOT_ID', 'snap-00000000000000003');
    vi.stubEnv('LAB_AWS_BLACK_DOMAIN_INITIAL_PASSWORD', 'test-password');
    mocks.send.mockResolvedValueOnce({
      Reservations: [{ Instances: [
        {
          InstanceId: 'i-00000000000000001', PrivateIpAddress: '10.0.0.10', State: { Name: 'stopped' },
          Tags: [{ Key: 'EnvironmentSlot', Value: 'wrong-slot' }, { Key: 'Lifecycle', Value: 'Reusable' }],
        },
        { InstanceId: 'i-00000000000000002', PrivateIpAddress: '10.0.0.20', State: { Name: 'stopped' }, Tags: [] },
        { InstanceId: 'i-00000000000000003', PrivateIpAddress: '10.0.0.30', State: { Name: 'stopped' }, Tags: [] },
      ] }],
    });

    const { provisionPreparedBlackDomainRun } = await import('./prepared-runtime');
    await expect(provisionPreparedBlackDomainRun({
      pool: { query: vi.fn().mockResolvedValue({ rows: [] }), connect: vi.fn() } as any,
      ownerId: 'owner-1',
      slug: 'black-domain',
      mode: 'practice',
    })).rejects.toMatchObject({ code: 'OPERATION_ENVIRONMENT_INVALID', status: 503 });
  });
});
