import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  send: vi.fn(),
  readinessProbe: vi.fn(),
}));

vi.mock('server-only', () => ({}));
vi.mock('@aws-sdk/client-ec2', async () => {
  const actual = await vi.importActual<any>('@aws-sdk/client-ec2');
  return { ...actual, EC2Client: class EC2Client { send = mocks.send; } };
});
vi.mock('@/lib/operations/readiness', () => ({
  probeOperationNodeReadiness: mocks.readinessProbe,
}));

describe('Operation AWS network readiness', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    vi.unstubAllEnvs();
    vi.stubEnv('LAB_AWS_ENABLED', 'true');
    vi.stubEnv('LAB_AWS_SUBNET_ID', 'subnet-123');
    vi.stubEnv('LAB_AWS_OPERATION_SECURITY_GROUP_ID', 'sg-123');
    vi.stubEnv('LAB_AWS_INSTANCE_PROFILE', 'oxsig-lab');
    vi.stubEnv('OXSIG_TERMINAL_BRIDGE_SECRET', 'test-operation-secret-0123456789abcdef0123456789abcdef');
  });

  it('refuses to fall back to the ordinary Cyber Lab security group', async () => {
    vi.stubEnv('LAB_AWS_OPERATION_SECURITY_GROUP_ID', '');
    vi.stubEnv('LAB_AWS_SECURITY_GROUP_ID', 'sg-ordinary');
    const { assertOperationRuntimeReady } = await import('./runtime');
    await expect(assertOperationRuntimeReady()).rejects.toMatchObject({
      code: 'OPERATION_AWS_CONFIGURATION_INCOMPLETE',
      status: 503,
    });
    expect(mocks.send).not.toHaveBeenCalled();
  });

  it('requires an internally connected security group for multi-node scenarios', async () => {
    mocks.send
      .mockResolvedValueOnce({ Subnets: [{ VpcId: 'vpc-1', CidrBlock: '10.0.1.0/24' }] })
      .mockResolvedValueOnce({ SecurityGroups: [{ GroupId: 'sg-123', VpcId: 'vpc-1', IpPermissions: [] }] });
    const { assertOperationRuntimeReady } = await import('./runtime');
    await expect(assertOperationRuntimeReady()).rejects.toMatchObject({ code: 'OPERATION_INTERNAL_NETWORK_BLOCKED', status: 503 });
  });

  it('rejects direct CIDR ingress on the dedicated Operation security group', async () => {
    mocks.send
      .mockResolvedValueOnce({ Subnets: [{ VpcId: 'vpc-1', CidrBlock: '10.0.1.0/24' }] })
      .mockResolvedValueOnce({ SecurityGroups: [{
        GroupId: 'sg-123',
        VpcId: 'vpc-1',
        IpPermissions: [
          { IpProtocol: '-1', UserIdGroupPairs: [{ GroupId: 'sg-123' }] },
          { IpProtocol: 'tcp', FromPort: 22, ToPort: 22, IpRanges: [{ CidrIp: '0.0.0.0/0' }] },
        ],
      }] });
    const { assertOperationRuntimeReady } = await import('./runtime');
    await expect(assertOperationRuntimeReady()).rejects.toMatchObject({ code: 'OPERATION_EXTERNAL_INGRESS_FORBIDDEN', status: 503 });
  });

  it('accepts a same-VPC self-only security group and preserves public egress compatibility by default', async () => {
    mocks.send
      .mockResolvedValueOnce({ Subnets: [{ VpcId: 'vpc-1', CidrBlock: '10.0.1.0/24' }] })
      .mockResolvedValueOnce({ SecurityGroups: [{
        GroupId: 'sg-123',
        VpcId: 'vpc-1',
        IpPermissions: [{ IpProtocol: '-1', UserIdGroupPairs: [{ GroupId: 'sg-123' }] }],
      }] });
    const { assertOperationRuntimeReady } = await import('./runtime');
    await expect(assertOperationRuntimeReady()).resolves.toMatchObject({
      subnetId: 'subnet-123',
      securityGroupId: 'sg-123',
      publicIpEnabled: true,
    });
  });

  it('allows an explicit private-addressing opt-in once outbound networking exists', async () => {
    const { operationPublicIpEnabled } = await import('./runtime');
    expect(operationPublicIpEnabled()).toBe(true);
    vi.stubEnv('LAB_AWS_OPERATION_PUBLIC_IP', 'false');
    expect(operationPublicIpEnabled()).toBe(false);
  });

  it('returns a clean slot conflict when concurrent allocation hits the one-lab unique index', async () => {
    vi.stubEnv('LAB_AWS_UBUNTU_AMI_ID', 'ami-ubuntu');
    vi.stubEnv('LAB_AWS_WINDOWS_AMI_ID', 'ami-windows');
    mocks.send
      .mockResolvedValueOnce({ Subnets: [{ VpcId: 'vpc-1', CidrBlock: '10.0.1.0/24' }] })
      .mockResolvedValueOnce({ SecurityGroups: [{
        GroupId: 'sg-123',
        VpcId: 'vpc-1',
        IpPermissions: [{ IpProtocol: '-1', UserIdGroupPairs: [{ GroupId: 'sg-123' }] }],
      }] });

    const clientQuery = vi.fn(async (sql: string) => {
      if (sql === 'BEGIN' || sql === 'ROLLBACK') return { rows: [], rowCount: 0 };
      if (sql.includes('SELECT 1 FROM lab_instances')) return { rows: [], rowCount: 0 };
      if (sql.includes('INSERT INTO lab_definitions')) return { rows: [{ id: 'definition-1' }], rowCount: 1 };
      if (sql.includes('INSERT INTO operation_runs')) return { rows: [{ id: 'run-1' }], rowCount: 1 };
      if (sql.includes('UPDATE operation_runs SET metadata=metadata ||')) return { rows: [], rowCount: 1 };
      if (sql.includes('INSERT INTO lab_instances')) {
        throw { code: '23505', constraint: 'idx_lab_instances_one_nonterminal_per_owner' };
      }
      throw new Error(`Unexpected query: ${sql}`);
    });
    const pool = {
      connect: vi.fn().mockResolvedValue({ query: clientQuery, release: vi.fn() }),
      query: vi.fn(),
    } as any;

    const { provisionOperationRun } = await import('./runtime');
    await expect(provisionOperationRun({ pool, ownerId: 'owner-1', slug: 'black-domain', mode: 'practice' }))
      .rejects.toMatchObject({ code: 'OPERATION_LAB_SLOT_OCCUPIED', status: 409 });
    expect(clientQuery).toHaveBeenCalledWith('ROLLBACK');
  });

  it('keeps an EC2-running node provisioning until the guest readiness marker is verified', async () => {
    mocks.send.mockResolvedValueOnce({ Reservations: [{ Instances: [{ InstanceId: 'i-00000000000000001', State: { Name: 'running' } }] }] });
    mocks.readinessProbe.mockResolvedValueOnce({ ready: false, reason: 'marker-missing' });
    const query = vi.fn(async (sql: string) => {
      if (sql.includes('FROM operation_runs')) return { rows: [{
        id: 'run-1', operation_slug: 'black-domain', mode: 'practice', status: 'provisioning',
        operator_lab_instance_id: 'lab-1', expires_at: new Date(Date.now() + 60_000).toISOString(),
        metadata: { readinessVersion: 1, initialAccess: { username: 'BLACKDOMAIN\\labuser', passwordSecret: 'hidden' } }, last_error: null,
      }], rowCount: 1 };
      if (sql.includes('FROM operation_nodes')) return { rows: [
        { id: 'n1', node_key: 'operator', label: 'Operator', role: 'operator', os_family: 'ubuntu', status: 'provisioning', runtime_external_id: 'i-00000000000000001', private_ip: '10.0.0.10', lab_instance_id: 'lab-1', metadata: {}, last_error: null },
      ], rowCount: 1 };
      if (sql.includes('UPDATE operation_nodes')) return { rows: [], rowCount: 1 };
      throw new Error(`Unexpected query: ${sql}`);
    });

    const { getOperationRun } = await import('./runtime');
    const result = await getOperationRun({ pool: { query } as any, runId: 'run-1', ownerId: 'owner-1' });
    expect(result.status).toBe('provisioning');
    expect(result.nodes[0]).toMatchObject({ status: 'provisioning', computeStatus: 'running', readiness: 'marker-missing' });
    expect(result.metadata).toMatchObject({ initialAccess: { username: 'BLACKDOMAIN\\labuser', available: true } });
    expect(JSON.stringify(result.metadata)).not.toContain('passwordSecret');
    expect(query).not.toHaveBeenCalledWith(expect.stringContaining("UPDATE lab_instances SET status='running'"), expect.anything());
  });

  it('promotes the Operation and operator lab only after guest readiness is verified', async () => {
    mocks.send.mockResolvedValueOnce({ Reservations: [{ Instances: [{ InstanceId: 'i-00000000000000001', State: { Name: 'running' } }] }] });
    mocks.readinessProbe.mockResolvedValueOnce({ ready: true, reason: 'ready' });
    const query = vi.fn(async (sql: string) => {
      if (sql.includes('FROM operation_runs')) return { rows: [{
        id: 'run-1', operation_slug: 'black-domain', mode: 'practice', status: 'provisioning',
        operator_lab_instance_id: 'lab-1', expires_at: new Date(Date.now() + 60_000).toISOString(),
        metadata: { readinessVersion: 1 }, last_error: null,
      }], rowCount: 1 };
      if (sql.includes('FROM operation_nodes')) return { rows: [
        { id: 'n1', node_key: 'operator', label: 'Operator', role: 'operator', os_family: 'ubuntu', status: 'provisioning', runtime_external_id: 'i-00000000000000001', private_ip: '10.0.0.10', lab_instance_id: 'lab-1', metadata: {}, last_error: null },
      ], rowCount: 1 };
      if (sql.includes('UPDATE operation_nodes')) return { rows: [], rowCount: 1 };
      if (sql.includes('UPDATE operation_runs SET status=')) return { rows: [], rowCount: 1 };
      if (sql.includes("UPDATE lab_instances SET status='running'")) return { rows: [], rowCount: 1 };
      throw new Error(`Unexpected query: ${sql}`);
    });

    const { getOperationRun } = await import('./runtime');
    const result = await getOperationRun({ pool: { query } as any, runId: 'run-1', ownerId: 'owner-1' });
    expect(result.status).toBe('running');
    expect(result.nodes[0]).toMatchObject({ status: 'running', computeStatus: 'running', readiness: 'ready' });
    expect(query).toHaveBeenCalledWith(expect.stringContaining('UPDATE operation_runs SET status='), ['running', 'run-1', 'owner-1']);
    expect(query).toHaveBeenCalledWith(expect.stringContaining("UPDATE lab_instances SET status='running'"), ['lab-1', 'owner-1']);
  });

  it('marks requested EC2 nodes destroyed when a successful AWS response omits them', async () => {
    mocks.send.mockResolvedValueOnce({ Reservations: [] });
    const query = vi.fn(async (sql: string) => {
      if (sql.includes('FROM operation_runs')) return { rows: [{
        id: 'run-1', operation_slug: 'black-domain', mode: 'practice', status: 'running',
        operator_lab_instance_id: null, expires_at: new Date(Date.now() + 60_000).toISOString(),
        metadata: {}, last_error: null,
      }], rowCount: 1 };
      if (sql.includes('FROM operation_nodes')) return { rows: [
        { id: 'n1', node_key: 'operator', label: 'Operator', role: 'operator', os_family: 'ubuntu', status: 'running', runtime_external_id: 'i-00000000000000001', private_ip: '10.0.0.10', lab_instance_id: 'lab-1', metadata: {}, last_error: null },
        { id: 'n2', node_key: 'workstation', label: 'Workstation', role: 'target', os_family: 'windows', status: 'running', runtime_external_id: 'i-00000000000000002', private_ip: '10.0.0.20', lab_instance_id: null, metadata: {}, last_error: null },
      ], rowCount: 2 };
      if (sql.includes('UPDATE operation_runs SET status=')) return { rows: [], rowCount: 1 };
      throw new Error(`Unexpected query: ${sql}`);
    });
    const { getOperationRun } = await import('./runtime');
    const result = await getOperationRun({ pool: { query } as any, runId: 'run-1', ownerId: 'owner-1' });
    expect(result.status).toBe('destroyed');
    expect(result.nodes.every((node) => node.status === 'destroyed')).toBe(true);
    expect(query).toHaveBeenCalledWith(expect.stringContaining('UPDATE operation_runs SET status='), ['destroyed', 'run-1', 'owner-1']);
  });

  it('preserves durable node state when EC2 reconciliation itself fails', async () => {
    mocks.send.mockRejectedValueOnce(new Error('AWS temporarily unavailable'));
    const query = vi.fn(async (sql: string) => {
      if (sql.includes('FROM operation_runs')) return { rows: [{
        id: 'run-1', operation_slug: 'black-domain', mode: 'practice', status: 'running',
        operator_lab_instance_id: null, expires_at: new Date(Date.now() + 60_000).toISOString(),
        metadata: {}, last_error: null,
      }], rowCount: 1 };
      if (sql.includes('FROM operation_nodes')) return { rows: [
        { id: 'n1', node_key: 'operator', label: 'Operator', role: 'operator', os_family: 'ubuntu', status: 'running', runtime_external_id: 'i-00000000000000001', private_ip: '10.0.0.10', lab_instance_id: 'lab-1', metadata: {}, last_error: null },
      ], rowCount: 1 };
      throw new Error(`Unexpected query: ${sql}`);
    });
    const { getOperationRun } = await import('./runtime');
    const result = await getOperationRun({ pool: { query } as any, runId: 'run-1', ownerId: 'owner-1' });
    expect(result.status).toBe('running');
    expect(result.nodes[0]?.status).toBe('running');
  });
});
