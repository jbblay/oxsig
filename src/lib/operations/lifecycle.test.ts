import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  send: vi.fn(),
}));

vi.mock('server-only', () => ({}));
vi.mock('@aws-sdk/client-ec2', async () => {
  const actual = await vi.importActual<any>('@aws-sdk/client-ec2');
  return { ...actual, EC2Client: class EC2Client { send = mocks.send; } };
});

function poolFor(run: Record<string, unknown>, ids = ['i-00000000000000001', 'i-00000000000000002', 'i-00000000000000003']) {
  const clientQuery = vi.fn(async (sql: string) => {
    if (sql === 'BEGIN' || sql === 'COMMIT' || sql === 'ROLLBACK') return { rows: [], rowCount: 0 };
    if (sql.includes('UPDATE operation_runs')) return { rows: [], rowCount: 1 };
    if (sql.includes('UPDATE operation_nodes')) return { rows: [], rowCount: 3 };
    if (sql.includes('UPDATE lab_instances')) return { rows: [], rowCount: 1 };
    throw new Error(`Unexpected client query: ${sql}`);
  });
  const release = vi.fn();
  const query = vi.fn(async (sql: string) => {
    if (sql.includes('FROM operation_runs')) return { rows: [run], rowCount: 1 };
    if (sql.includes('FROM operation_nodes')) return {
      rows: ids.map((runtime_external_id, index) => ({ id: `node-${index + 1}`, runtime_external_id })),
      rowCount: ids.length,
    };
    throw new Error(`Unexpected pool query: ${sql}`);
  });
  return {
    pool: { query, connect: vi.fn().mockResolvedValue({ query: clientQuery, release }) } as any,
    clientQuery,
    release,
  };
}

describe('Operation lifecycle', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it('pauses all running nodes and commits the durable state on one client', async () => {
    const { pool, clientQuery, release } = poolFor({
      id: 'run-1', status: 'running', expires_at: new Date(Date.now() + 60_000).toISOString(),
      operator_lab_instance_id: 'lab-1', metadata: {},
    });
    mocks.send
      .mockResolvedValueOnce({ Reservations: [{ Instances: [
        { InstanceId: 'i-00000000000000001', State: { Name: 'running' } },
        { InstanceId: 'i-00000000000000002', State: { Name: 'running' } },
        { InstanceId: 'i-00000000000000003', State: { Name: 'running' } },
      ] }] })
      .mockResolvedValueOnce({ StoppingInstances: [] });

    const { pauseOperationRun } = await import('./lifecycle');
    await expect(pauseOperationRun({ pool, runId: 'run-1', ownerId: 'owner-1' })).resolves.toMatchObject({ paused: true, stopping: 3 });
    expect(mocks.send.mock.calls.map(([command]) => command.constructor.name)).toEqual(['DescribeInstancesCommand', 'StopInstancesCommand']);
    expect(clientQuery.mock.calls.map(([sql]) => sql)).toEqual(expect.arrayContaining(['BEGIN', 'COMMIT']));
    expect(release).toHaveBeenCalledOnce();
  });

  it('reports pausing until every EC2 machine is actually stopped', async () => {
    const { pool } = poolFor({
      id: 'run-1', status: 'provisioning', expires_at: new Date(Date.now() + 60_000).toISOString(),
      operator_lab_instance_id: 'lab-1', metadata: { lifecycleState: 'paused' },
    });
    mocks.send.mockResolvedValueOnce({ Reservations: [{ Instances: [
      { InstanceId: 'i-00000000000000001', State: { Name: 'stopping' } },
      { InstanceId: 'i-00000000000000002', State: { Name: 'stopped' } },
      { InstanceId: 'i-00000000000000003', State: { Name: 'stopped' } },
    ] }] });

    const { getOperationLifecycleProgress } = await import('./lifecycle');
    await expect(getOperationLifecycleProgress({ pool, runId: 'run-1', ownerId: 'owner-1' })).resolves.toEqual({
      phase: 'pausing',
      total: 3,
      stopped: 2,
      nodeStates: {
        'node-1': 'stopping',
        'node-2': 'stopped',
        'node-3': 'stopped',
      },
    });
  });

  it('reports paused only after every EC2 machine is stopped', async () => {
    const { pool } = poolFor({
      id: 'run-1', status: 'provisioning', expires_at: new Date(Date.now() + 60_000).toISOString(),
      operator_lab_instance_id: 'lab-1', metadata: { lifecycleState: 'paused' },
    });
    mocks.send.mockResolvedValueOnce({ Reservations: [{ Instances: [
      { InstanceId: 'i-00000000000000001', State: { Name: 'stopped' } },
      { InstanceId: 'i-00000000000000002', State: { Name: 'stopped' } },
      { InstanceId: 'i-00000000000000003', State: { Name: 'stopped' } },
    ] }] });

    const { getOperationLifecycleProgress } = await import('./lifecycle');
    await expect(getOperationLifecycleProgress({ pool, runId: 'run-1', ownerId: 'owner-1' })).resolves.toMatchObject({
      phase: 'paused',
      total: 3,
      stopped: 3,
    });
  });

  it('resumes only a fully stopped paused Operation and forces fresh readiness', async () => {
    const { pool, clientQuery } = poolFor({
      id: 'run-1', status: 'provisioning', expires_at: new Date(Date.now() + 60_000).toISOString(),
      operator_lab_instance_id: 'lab-1', metadata: { lifecycleState: 'paused' },
    });
    mocks.send
      .mockResolvedValueOnce({ Reservations: [{ Instances: [
        { InstanceId: 'i-00000000000000001', State: { Name: 'stopped' } },
        { InstanceId: 'i-00000000000000002', State: { Name: 'stopped' } },
        { InstanceId: 'i-00000000000000003', State: { Name: 'stopped' } },
      ] }] })
      .mockResolvedValueOnce({ StartingInstances: [] });

    const { resumeOperationRun } = await import('./lifecycle');
    await expect(resumeOperationRun({ pool, runId: 'run-1', ownerId: 'owner-1' })).resolves.toMatchObject({ resumed: true, starting: 3 });
    expect(mocks.send.mock.calls.map(([command]) => command.constructor.name)).toEqual(['DescribeInstancesCommand', 'StartInstancesCommand']);
    expect(clientQuery).toHaveBeenCalledWith(expect.stringContaining("metadata=metadata - 'bootstrapReadyAt' - 'readinessCheckedAt' - 'readinessReason'"), ['run-1']);
  });

  it('does not pause a still-initializing Operation', async () => {
    const { pool } = poolFor({
      id: 'run-1', status: 'provisioning', expires_at: new Date(Date.now() + 60_000).toISOString(),
      operator_lab_instance_id: 'lab-1', metadata: {},
    });
    const { pauseOperationRun } = await import('./lifecycle');
    await expect(pauseOperationRun({ pool, runId: 'run-1', ownerId: 'owner-1' })).rejects.toMatchObject({ code: 'OPERATION_NOT_READY_TO_PAUSE' });
    expect(mocks.send).not.toHaveBeenCalled();
  });
});