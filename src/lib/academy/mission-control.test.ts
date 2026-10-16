import { beforeEach, describe, expect, it, vi } from 'vitest';

const mock = vi.hoisted(() => ({ query: vi.fn(), execute: vi.fn(), answer: vi.fn() }));
vi.mock('server-only', () => ({}));
vi.mock('@/lib/db/pool', () => ({ getPool: () => ({ query: mock.query }) }));
vi.mock('@/lib/labs/catalog', () => ({ LAB_CATALOG: [{ slug: 'ubuntu-security-lab', platform: 'linux' }] }));
vi.mock('@/lib/labs/aws-runtime', () => ({ executeLabCommand: mock.execute }));
vi.mock('@/lib/academy/server', () => ({ answerAcademyQuestion: mock.answer }));

import { MissionControlError, verifyDockerMission } from './mission-control';

const ownerId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const labInstanceId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const externalId = 'i-0123456789abcdef0';
const progressRow = {
  mission_id: 'deploy', lab_instance_id: labInstanceId, difficulty: 'intermediate',
  notes: '', hints_used: 0, prepared_at: null, verified_at: null,
  checks: [], updated_at: '2026-10-15T00:00:00.000Z',
};

describe('Docker mission evidence-based progression', () => {
  beforeEach(() => vi.resetAllMocks());

  it('binds verification to a learner-owned running Linux lab and fixed command', async () => {
    mock.query
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{
        id: labInstanceId, status: 'running', runtime_provider: 'aws-ec2',
        runtime_external_id: externalId, slug: 'ubuntu-security-lab',
        expires_at: '2099-10-15T00:00:00.000Z',
      }] })
      .mockResolvedValueOnce({ rows: [{ ...progressRow, verified_at: '2026-10-15T01:00:00.000Z' }] });
    mock.execute.mockResolvedValueOnce({ status: 'Success', exitCode: 0, stdout: 'engine=ready\nrunning=ok\nport=ok\nhttp=ok\n' });

    const result = await verifyDockerMission(ownerId, 'deploy', labInstanceId, 'intermediate');
    expect(result.passed).toBe(true);
    expect(result.provenance).toBe('server-executed');
    expect(mock.query.mock.calls[1][1]).toEqual([labInstanceId, ownerId]);
    expect(mock.execute.mock.calls[0][0]).toBe(externalId);
    expect(mock.execute.mock.calls[0][1]).toContain('docker inspect');
    expect(mock.query.mock.calls[2][1][5]).toBe(true);
  });

  it('does not award a pass when the HTTP endpoint fails', async () => {
    mock.query
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{
        id: labInstanceId, status: 'running', runtime_provider: 'aws-ec2',
        runtime_external_id: externalId, slug: 'ubuntu-security-lab', expires_at: null,
      }] })
      .mockResolvedValueOnce({ rows: [progressRow] });
    mock.execute.mockResolvedValueOnce({ status: 'Success', exitCode: 0, stdout: 'engine=ready\nrunning=ok\nport=ok\n' });
    const result = await verifyDockerMission(ownerId, 'deploy', labInstanceId, 'beginner');
    expect(result.passed).toBe(false);
    expect(mock.query.mock.calls[2][1][5]).toBe(false);
  });

  it('refuses to verify the repair mission before its fault was seeded', async () => {
    mock.query
      .mockResolvedValueOnce({ rows: [{ ...progressRow, mission_id: 'deploy', verified_at: '2026-10-15T00:00:00.000Z' }] })
      .mockResolvedValueOnce({ rows: [] });
    await expect(verifyDockerMission(ownerId, 'repair', labInstanceId, 'advanced'))
      .rejects.toMatchObject({ code: 'FAULT_REQUIRED' } satisfies Partial<MissionControlError>);
    expect(mock.execute).not.toHaveBeenCalled();
  });
});
