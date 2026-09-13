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

  it('starts exactly the existing three slot instances without creating compute', async () => {
    const roles = ['dc', 'workstation', 'operator'];
    const ids = roles.map((_, index) => `i-0000000000000000${index + 1}`);
    vi.stubEnv('LAB_AWS_BLACK_DOMAIN_SLOT_KEY', 'black-domain-slot-01');
    vi.stubEnv('LAB_AWS_BLACK_DOMAIN_INITIAL_PASSWORD', 'test-password');
    vi.stubEnv('OXSIG_TERMINAL_BRIDGE_SECRET', 'test-operation-secret-0123456789abcdef0123456789abcdef');
    roles.forEach((role, index) => {
      vi.stubEnv(`LAB_AWS_BLACK_DOMAIN_${role.toUpperCase()}_INSTANCE_ID`, ids[index]);
      vi.stubEnv(`LAB_AWS_BLACK_DOMAIN_${role.toUpperCase()}_SNAPSHOT_ID`, `snap-0000000000000000${index + 1}`);
    });
    mocks.send.mockImplementation(async (command) => {
      if (command.constructor.name === 'DescribeInstancesCommand') return {
        Reservations: [{ Instances: roles.map((role, index) => ({
          InstanceId: ids[index], PrivateIpAddress: `10.0.0.${index + 10}`, State: { Name: 'stopped' },
          Tags: Object.entries({ App: 'Oxsig', Purpose: 'OperationEnvironment', OperationSlug: 'black-domain',
            EnvironmentSlot: 'black-domain-slot-01', Lifecycle: 'Reusable', OperationNodeKey: role })
            .map(([Key, Value]) => ({ Key, Value })),
        })) }],
      };
      if (command.constructor.name === 'StartInstancesCommand') return {};
      throw new Error(`Unexpected AWS mutation: ${command.constructor.name}`);
    });
    const query = vi.fn(async (sql: string) => {
      if (sql.includes('SELECT 1 FROM lab_instances')) return { rows: [], rowCount: 0 };
      if (sql.includes('INSERT INTO operation_environments')) return { rows: [{ id: 'env-1' }], rowCount: 1 };
      if (sql.includes('FROM operation_environments')) return { rows: [{ id: 'env-1',
        dc_instance_id: ids[0], workstation_instance_id: ids[1], operator_instance_id: ids[2],
        dc_private_ip: '10.0.0.10', workstation_private_ip: '10.0.0.11', operator_private_ip: '10.0.0.12',
      }], rowCount: 1 };
      if (sql.includes('INSERT INTO lab_definitions')) return { rows: [{ id: 'definition-1' }], rowCount: 1 };
      if (sql.includes('INSERT INTO operation_runs')) return { rows: [{ id: 'run-1' }], rowCount: 1 };
      if (sql.includes('INSERT INTO lab_instances')) return { rows: [{ id: 'lab-1' }], rowCount: 1 };
      if (sql.includes('INSERT INTO operation_nodes')) return { rows: roles.map((role, index) => ({
        id: `node-${index}`, node_key: role, runtime_external_id: ids[index],
      })), rowCount: 3 };
      if (sql.startsWith('UPDATE ') || ['BEGIN', 'COMMIT', 'ROLLBACK'].includes(sql)) return { rows: [], rowCount: 1 };
      throw new Error(`Unexpected SQL: ${sql}`);
    });
    const client = { query, release: vi.fn() };
    const pool = { query: vi.fn().mockResolvedValue({ rows: [], rowCount: 0 }), connect: vi.fn().mockResolvedValue(client) };
    const { provisionPreparedBlackDomainRun } = await import('./prepared-runtime');
    await expect(provisionPreparedBlackDomainRun({ pool: pool as any, ownerId: 'owner-1', slug: 'black-domain', mode: 'practice' }))
      .resolves.toMatchObject({ runId: 'run-1', environmentId: 'env-1', status: 'provisioning' });
    const commands = mocks.send.mock.calls.map(([command]) => command);
    expect(commands.map((command) => command.constructor.name)).toEqual(['DescribeInstancesCommand', 'StartInstancesCommand']);
    expect(commands[1].input.InstanceIds).toEqual(ids);
    expect(query).toHaveBeenCalledWith('COMMIT');
    expect(client.release).toHaveBeenCalledOnce();
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
