import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  query: vi.fn(),
  executeLabCommand: vi.fn(),
}));

vi.mock('server-only', () => ({}));
vi.mock('@/lib/db/pool', () => ({ getPool: () => ({ query: mocks.query }) }));
vi.mock('@/lib/labs/catalog', () => ({
  LAB_CATALOG: [{ slug: 'ubuntu', platform: 'linux' }],
}));
vi.mock('@/lib/labs/aws-runtime', () => ({ executeLabCommand: mocks.executeLabCommand }));

import {
  cleanupAcademyFailure,
  FAILURE_TEMPLATE_ID,
  injectAcademyFailure,
  verifyAcademyFailureRemediation,
} from './failure-injection';

const ownerId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const courseId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const labId = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const attemptId = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
const externalId = 'i-0123456789abcdef0';
const course = {
  title: 'Linux Troubleshooting',
  topic: 'Linux',
  level: 'beginner' as const,
  overview: 'Troubleshoot safely.',
  estimatedMinutes: 60,
  objectives: ['Diagnose configuration', 'Verify remediation'],
  prerequisites: [],
  lessons: [{
    id: 'lesson-1',
    title: 'Configuration diagnosis',
    summary: 'Compare active and expected state.',
    explanation: 'Configuration drift can cause unhealthy behavior.',
    keyPoints: ['Observe', 'Compare'],
    visual: { title: 'Troubleshooting', nodes: ['Observe', 'Diagnose', 'Repair', 'Verify'] },
    practice: {
      title: 'Inspect state',
      instruction: 'Inspect the synthetic application state.',
      command: 'true',
      expected: 'Healthy state.',
      labRequired: true,
    },
    checkpoint: 'What diverged?',
  }],
};

function row(state: string, overrides: Record<string, unknown> = {}) {
  return {
    id: attemptId,
    lesson_id: 'lesson-1',
    lab_instance_id: labId,
    template_id: FAILURE_TEMPLATE_ID,
    state,
    workspace_path: `/tmp/oxsig-failure-labs/${attemptId}`,
    pre_evidence: null,
    fault_evidence: null,
    verification_evidence: null,
    cleanup_evidence: null,
    failure_reason: null,
    created_at: '2026-09-06T10:00:00.000Z',
    injected_at: state === 'injected' || state === 'remediated' ? '2026-09-06T10:01:00.000Z' : null,
    remediated_at: state === 'remediated' ? '2026-09-06T10:03:00.000Z' : null,
    cleaned_at: state === 'cleaned' ? '2026-09-06T10:04:00.000Z' : null,
    ...overrides,
  };
}

describe('Academy curated failure injection', () => {
  beforeEach(() => vi.clearAllMocks());

  it('injects only inside a UUID-scoped /tmp workspace and records expected unhealthy evidence', async () => {
    mocks.query
      .mockResolvedValueOnce({ rows: [{ id: courseId, course_data: course }] })
      .mockResolvedValueOnce({ rows: [{ id: labId, status: 'running', runtime_provider: 'aws-ec2', runtime_external_id: externalId, slug: 'ubuntu' }] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [row('injected')] });
    mocks.executeLabCommand
      .mockResolvedValueOnce({ stdout: 'workspace=clean\n', stderr: '', exitCode: 0 })
      .mockResolvedValueOnce({ stdout: 'status=unhealthy\nobserved_mode=broken\n', stderr: '', exitCode: 23 });

    const result = await injectAcademyFailure({
      ownerId,
      courseTitle: course.title,
      lessonTitle: 'Configuration diagnosis',
      labInstanceId: labId,
    });

    expect(result.state).toBe('injected');
    expect(mocks.executeLabCommand).toHaveBeenCalledTimes(2);
    for (const call of mocks.executeLabCommand.mock.calls) {
      expect(call[0]).toBe(externalId);
      expect(call[1]).toContain('/tmp/oxsig-failure-labs/');
      expect(call[2]).toBe('linux');
    }
    expect(String(mocks.executeLabCommand.mock.calls[1]?.[1])).toContain('app.defaults');
    expect(String(mocks.executeLabCommand.mock.calls[1]?.[1])).toContain('app.conf');
  });

  it('marks the attempt remediated only when the fixed verifier reports healthy', async () => {
    mocks.query
      .mockResolvedValueOnce({ rows: [{
        ...row('injected'),
        lab_status: 'running',
        runtime_provider: 'aws-ec2',
        runtime_external_id: externalId,
        slug: 'ubuntu',
      }] })
      .mockResolvedValueOnce({ rows: [row('remediated', {
        verification_evidence: { provenance: 'server-executed', check: 'verify', stdout: 'status=healthy\n', stderr: '', exitCode: 0, observedAt: '2026-09-06T10:03:00.000Z' },
      })] });
    mocks.executeLabCommand.mockResolvedValueOnce({ stdout: 'status=healthy\nobserved_mode=healthy\n', stderr: '', exitCode: 0 });

    const result = await verifyAcademyFailureRemediation({ ownerId, attemptId });

    expect(result.state).toBe('remediated');
    expect(String(mocks.executeLabCommand.mock.calls[0]?.[1])).toContain('app.defaults');
    expect(String(mocks.executeLabCommand.mock.calls[0]?.[1])).toContain('app.conf');
  });

  it('cleans only the bound isolated workspace', async () => {
    mocks.query
      .mockResolvedValueOnce({ rows: [{
        ...row('remediated'),
        lab_status: 'running',
        runtime_provider: 'aws-ec2',
        runtime_external_id: externalId,
        slug: 'ubuntu',
      }] })
      .mockResolvedValueOnce({ rows: [row('cleaned')] });
    mocks.executeLabCommand.mockResolvedValueOnce({ stdout: 'cleanup=complete\n', stderr: '', exitCode: 0 });

    const result = await cleanupAcademyFailure({ ownerId, attemptId });

    expect(result.state).toBe('cleaned');
    const command = String(mocks.executeLabCommand.mock.calls[0]?.[1]);
    expect(command).toContain(`/tmp/oxsig-failure-labs/${attemptId}`);
    expect(command).toContain('case "$base" in /tmp/oxsig-failure-labs/*)');
  });
});
