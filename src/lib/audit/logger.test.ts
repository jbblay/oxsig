import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  query: vi.fn(),
  recordLearningActivity: vi.fn(),
}));

vi.mock('@/lib/db/pool', () => ({ getPool: () => ({ query: mocks.query }) }));
vi.mock('@/lib/learning/activity', () => ({ recordLearningActivity: mocks.recordLearningActivity }));

import { AUDIT_ACTIONS, getRequestMetadata, logAudit } from './logger';

function requestWithHeaders(headers: Record<string, string>) {
  return {
    headers: {
      get(name: string) {
        return headers[name.toLowerCase()] ?? null;
      },
    },
  };
}

describe('getRequestMetadata', () => {
  it('uses the first forwarded IP address', () => {
    expect(getRequestMetadata(requestWithHeaders({
      'x-forwarded-for': '203.0.113.20, 10.0.0.1',
      'user-agent': 'OXSIG test',
    }))).toEqual({
      ipAddress: '203.0.113.20',
      userAgent: 'OXSIG test',
    });
  });

  it('omits a missing IP instead of writing an invalid INET value', () => {
    expect(getRequestMetadata(requestWithHeaders({}))).toEqual({
      ipAddress: undefined,
      userAgent: 'unknown',
    });
  });
});

describe('audit-backed learning activity', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.query.mockResolvedValue({ rows: [] });
    mocks.recordLearningActivity.mockResolvedValue(true);
  });

  it('records a lab learning pulse after a Cyber Lab interactive session starts', async () => {
    await logAudit({ userId: 'user-1', action: AUDIT_ACTIONS.LAB_SESSION_START, resourceType: 'lab', resourceId: 'lab-1' });

    expect(mocks.query).toHaveBeenCalledTimes(1);
    expect(mocks.recordLearningActivity).toHaveBeenCalledWith('user-1', 'lab');
  });

  it('records successful Cyber Lab command use but not failed or lifecycle-only actions', async () => {
    await logAudit({ userId: 'user-1', action: AUDIT_ACTIONS.LAB_COMMAND, resourceType: 'lab' });
    await logAudit({ userId: 'user-1', action: AUDIT_ACTIONS.LAB_COMMAND_FAILED, resourceType: 'lab' });
    await logAudit({ userId: 'user-1', action: AUDIT_ACTIONS.LAB_STOP, resourceType: 'lab' });

    expect(mocks.recordLearningActivity).toHaveBeenCalledTimes(1);
    expect(mocks.recordLearningActivity).toHaveBeenCalledWith('user-1', 'lab');
  });

  it('does not classify Live Workspace terminal sessions as Cyber Lab activity', async () => {
    await logAudit({ userId: 'user-1', action: AUDIT_ACTIONS.LAB_SESSION_START, resourceType: 'live-workspace-terminal' });

    expect(mocks.recordLearningActivity).not.toHaveBeenCalled();
  });

  it('does not create learner activity for anonymous audit entries', async () => {
    await logAudit({ action: AUDIT_ACTIONS.LAB_SESSION_START, resourceType: 'lab' });

    expect(mocks.recordLearningActivity).not.toHaveBeenCalled();
  });
});
