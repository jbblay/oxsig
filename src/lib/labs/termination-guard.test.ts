import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ send: vi.fn() }));
vi.mock('server-only', () => ({}));
vi.mock('@aws-sdk/client-ec2', async () => {
  const actual = await vi.importActual<any>('@aws-sdk/client-ec2');
  return { ...actual, EC2Client: class { send = mocks.send; } };
});

import { destroyLabVm } from './aws-runtime';
import { destroyOperationRun } from '@/lib/operations/runtime';

const instanceId = 'i-0123456789abcdef0';
const disposableTags = [{ Key: 'App', Value: 'Oxsig' }, { Key: 'Purpose', Value: 'CyberLab' }];
const described = (Tags = disposableTags) => ({ Reservations: [{ Instances: [{ InstanceId: instanceId, Tags }] }] });
const terminations = () => mocks.send.mock.calls.filter(([command]) => command.constructor.name === 'TerminateInstancesCommand');

describe('EC2 termination protection', () => {
  beforeEach(() => {
    mocks.send.mockReset();
    for (const role of ['DC', 'WORKSTATION', 'OPERATOR']) {
      vi.stubEnv(`LAB_AWS_BLACK_DOMAIN_${role}_INSTANCE_ID`, '');
    }
  });
  afterEach(() => vi.unstubAllEnvs());

  it.each(['DC', 'WORKSTATION', 'OPERATOR'])('protects the configured %s even with the prepared flag disabled', async (role) => {
    vi.stubEnv(`LAB_AWS_BLACK_DOMAIN_${role}_INSTANCE_ID`, instanceId);
    vi.stubEnv('LAB_AWS_BLACK_DOMAIN_PREPARED', 'false');
    await expect(destroyLabVm(instanceId)).rejects.toThrow('reusable');
    expect(mocks.send).not.toHaveBeenCalled();
  });

  it.each([
    { Key: 'Lifecycle', Value: 'Reusable' },
    { Key: 'EnvironmentSlot', Value: 'black-domain-slot-01' },
    { Key: 'Purpose', Value: 'OperationEnvironment' },
  ])('protects reusable EC2 tags independently of database metadata: $Key', async (tag) => {
    mocks.send.mockResolvedValueOnce(described([...disposableTags, tag]));
    await expect(destroyLabVm(instanceId)).rejects.toThrow('reusable');
    expect(terminations()).toHaveLength(0);
  });

  it('does not terminate when EC2 inspection fails', async () => {
    mocks.send.mockRejectedValueOnce(new Error('Describe denied'));
    await expect(destroyLabVm(instanceId)).rejects.toThrow('Describe denied');
    expect(terminations()).toHaveLength(0);
  });

  it.each([{ Reservations: [] }, described([])])('does not terminate unverified compute', async (response) => {
    mocks.send.mockResolvedValueOnce(response);
    await expect(destroyLabVm(instanceId)).rejects.toThrow();
    expect(terminations()).toHaveLength(0);
  });

  it.each(['CyberLab', 'OperationNode'])('still terminates verified disposable %s compute', async (purpose) => {
    mocks.send.mockResolvedValueOnce(described([{ Key: 'App', Value: 'Oxsig' }, { Key: 'Purpose', Value: purpose }]))
      .mockResolvedValueOnce({});
    await destroyLabVm(instanceId);
    expect(terminations()).toHaveLength(1);
    expect(terminations()[0][0].input).toEqual({ InstanceIds: [instanceId] });
  });

  it('protects a reusable instance referenced by a stale disposable Operation run', async () => {
    vi.stubEnv('LAB_AWS_BLACK_DOMAIN_DC_INSTANCE_ID', instanceId);
    const query = vi.fn()
      .mockResolvedValueOnce({ rows: [{ id: 'run-1', status: 'running', environment_id: null }] })
      .mockResolvedValueOnce({ rows: [{ runtime_external_id: instanceId }] });
    await expect(destroyOperationRun({ pool: { query } as any, runId: 'run-1', ownerId: 'owner-1' })).rejects.toThrow('reusable');
    expect(query).toHaveBeenCalledTimes(2);
    expect(mocks.send).not.toHaveBeenCalled();
  });
});
