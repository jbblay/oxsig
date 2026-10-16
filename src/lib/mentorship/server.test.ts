import { beforeEach, describe, expect, it, vi } from 'vitest';

type Handler = [RegExp, (params: unknown[]) => { rows: Record<string, unknown>[] } | Promise<never>];

const mocks = vi.hoisted(() => ({
  poolQuery: vi.fn(),
  clientQuery: vi.fn(),
  notify: vi.fn(),
}));

vi.mock('server-only', () => ({}));
vi.mock('@/lib/db/pool', () => ({
  getPool: () => ({ query: mocks.poolQuery }),
  transaction: async (callback: (client: { query: typeof mocks.clientQuery }) => unknown) => callback({ query: mocks.clientQuery }),
}));
vi.mock('@/lib/notifications/server', () => ({ createWorkspaceNotification: mocks.notify }));

import {
  MentorshipError,
  getMentorCenterState,
  listMentorDirectory,
  submitMentorApplication,
  updateOwnMentorProfile,
  withdrawMentorApplication,
} from './server';

const userId = '11111111-1111-4111-8111-111111111111';
const applicationId = '22222222-2222-4222-8222-222222222222';
const LINUX = ['command-resolution', 'fork-copy-on-write', 'execve-elf', 'virtual-address-space', 'runtime-startup', 'process-context'];

const application = {
  track: 'academy' as const,
  headline: 'Linux learner who can teach',
  bio: 'b'.repeat(90),
  specializations: ['linux-systems'],
  yearsExperience: 0,
  teachingBackground: '',
  motivation: 'm'.repeat(45),
  credentials: [],
  timezone: 'Europe/London',
  acceptCodeOfConduct: true as const,
};

const applicationRow = {
  id: applicationId,
  track: 'academy',
  status: 'submitted',
  headline: application.headline,
  bio: application.bio,
  specializations: ['linux-systems'],
  years_experience: 0,
  teaching_background: '',
  motivation: application.motivation,
  credentials: [],
  profile_url: null,
  timezone: 'Europe/London',
  decision_note: null,
  decided_at: null,
  submitted_at: '2026-10-15T10:00:00.000Z',
  updated_at: '2026-10-15T10:00:00.000Z',
};

function router(handlers: Handler[]) {
  return async (sql: string, params: unknown[] = []) => {
    for (const [pattern, respond] of handlers) if (pattern.test(sql)) return respond(params);
    return { rows: [] };
  };
}

const evidenceRows = (ids: string[]) => ids.map((capability_id) => ({ path_id: 'program-becomes-process', capability_id }));

function baseHandlers(overrides: Partial<Record<'evidence' | 'profile' | 'open' | 'rejected', Record<string, unknown>[]>> = {}): Handler[] {
  return [
    [/FROM users WHERE id=\$1 AND is_active=true FOR UPDATE/, () => ({ rows: [{ id: userId }] })],
    [/FROM mentor_profiles WHERE user_id=\$1 LIMIT 1/, () => ({ rows: overrides.profile ?? [] })],
    [/status IN \('submitted','under_review','changes_requested'\) LIMIT 1/, () => ({ rows: overrides.open ?? [] })],
    [/MAX\(decided_at\) AS last_rejected_at/, () => ({ rows: overrides.rejected ?? [{ last_rejected_at: null }] })],
    [/capability_proof/, () => ({ rows: overrides.evidence ?? [] })],
    [/INSERT INTO mentor_applications/, () => ({ rows: [applicationRow] })],
  ];
}

const sqlCalls = () => mocks.clientQuery.mock.calls.map((call) => String(call[0]));

beforeEach(() => {
  mocks.poolQuery.mockReset().mockResolvedValue({ rows: [] });
  mocks.clientQuery.mockReset();
  mocks.notify.mockReset().mockResolvedValue(null);
});

describe('submitMentorApplication', () => {
  it('refuses Academy-track applications without verified capability evidence', async () => {
    mocks.clientQuery.mockImplementation(router(baseHandlers()));
    await expect(submitMentorApplication(userId, application)).rejects.toMatchObject({ code: 'NOT_ELIGIBLE', status: 403 });
    expect(sqlCalls().some((sql) => sql.includes('INSERT INTO mentor_applications'))).toBe(false);
  });

  it('refuses Academy-track claims for specializations without enough evidence', async () => {
    mocks.clientQuery.mockImplementation(router(baseHandlers({ evidence: evidenceRows(LINUX) })));
    await expect(
      submitMentorApplication(userId, { ...application, specializations: ['linux-systems', 'containers-docker'] })
    ).rejects.toMatchObject({ code: 'SPECIALIZATION_NOT_ELIGIBLE', details: { specializations: ['containers-docker'] } });
  });

  it('stores an evidence snapshot and notifies reviewers when eligible', async () => {
    mocks.clientQuery.mockImplementation(router(baseHandlers({ evidence: evidenceRows(LINUX) })));
    mocks.poolQuery.mockResolvedValue({ rows: [{ id: 'admin-1' }] });
    const result = await submitMentorApplication(userId, application);
    expect(result).toMatchObject({ id: applicationId, status: 'submitted', track: 'academy' });
    const insert = mocks.clientQuery.mock.calls.find((call) => String(call[0]).includes('INSERT INTO mentor_applications'))!;
    const snapshot = JSON.parse(insert[1][11] as string);
    expect(snapshot.specializations).toEqual([expect.objectContaining({ specializationId: 'linux-systems', demonstrated: 6, eligible: true })]);
    expect(sqlCalls().some((sql) => sql.includes('INSERT INTO mentor_application_events'))).toBe(true);
    expect(mocks.notify).toHaveBeenCalledWith(expect.objectContaining({ ownerId: 'admin-1', href: '/admin?tab=mentors' }));
  });

  it('does not use XP or mastery anywhere in eligibility', async () => {
    mocks.clientQuery.mockImplementation(router(baseHandlers({ evidence: evidenceRows(LINUX) })));
    await submitMentorApplication(userId, application);
    expect(sqlCalls().join('\n')).not.toMatch(/academy_mastery|learning_activity_days|\bxp\b/i);
  });

  it('blocks a second open application', async () => {
    mocks.clientQuery.mockImplementation(router(baseHandlers({ open: [{ id: 'existing' }] })));
    await expect(submitMentorApplication(userId, { ...application, track: 'external', yearsExperience: 5 })).rejects.toMatchObject({ code: 'APPLICATION_OPEN' });
  });

  it('maps a concurrent unique-index violation to APPLICATION_OPEN', async () => {
    mocks.clientQuery.mockImplementation(router([
      ...baseHandlers({ evidence: evidenceRows(LINUX) }).filter(([pattern]) => !pattern.test('INSERT INTO mentor_applications')),
      [/INSERT INTO mentor_applications/, () => Promise.reject(Object.assign(new Error('duplicate'), { code: '23505' }))],
    ]));
    await expect(submitMentorApplication(userId, application)).rejects.toMatchObject({ code: 'APPLICATION_OPEN' });
  });

  it('blocks existing, suspended and recently rejected mentors', async () => {
    mocks.clientQuery.mockImplementation(router(baseHandlers({ profile: [{ status: 'active' }] })));
    await expect(submitMentorApplication(userId, application)).rejects.toMatchObject({ code: 'ALREADY_MENTOR' });

    mocks.clientQuery.mockImplementation(router(baseHandlers({ profile: [{ status: 'suspended' }] })));
    await expect(submitMentorApplication(userId, application)).rejects.toMatchObject({ code: 'MENTOR_SUSPENDED' });

    mocks.clientQuery.mockImplementation(router(baseHandlers({ rejected: [{ last_rejected_at: new Date(Date.now() - 86_400_000).toISOString() }] })));
    await expect(submitMentorApplication(userId, application)).rejects.toMatchObject({ code: 'REAPPLY_COOLDOWN' });
  });
});

describe('withdrawMentorApplication', () => {
  it('scopes the lock to the applicant so other users cannot withdraw it', async () => {
    mocks.clientQuery.mockImplementation(router([[/FOR UPDATE/, () => ({ rows: [] })]]));
    await expect(withdrawMentorApplication(userId, applicationId)).rejects.toBeInstanceOf(MentorshipError);
    const lock = mocks.clientQuery.mock.calls[0];
    expect(String(lock[0])).toContain('applicant_id=$2');
    expect(lock[1]).toEqual([applicationId, userId]);
  });

  it('cannot withdraw a decided application', async () => {
    mocks.clientQuery.mockImplementation(router([[/FOR UPDATE/, () => ({ rows: [{ id: applicationId, applicant_id: userId, status: 'approved', track: 'academy' }] })]]));
    await expect(withdrawMentorApplication(userId, applicationId)).rejects.toMatchObject({ code: 'INVALID_TRANSITION' });
  });
});

describe('updateOwnMentorProfile', () => {
  it('refuses edits while suspended', async () => {
    mocks.clientQuery.mockImplementation(router([[/FROM mentor_profiles WHERE user_id=\$1 FOR UPDATE/, () => ({ rows: [{ status: 'suspended' }] })]]));
    await expect(updateOwnMentorProfile(userId, { headline: 'A brand new headline' })).rejects.toMatchObject({ code: 'PROFILE_LOCKED' });
  });

  it('never writes tier or qualifications', async () => {
    mocks.clientQuery.mockImplementation(router([[/FOR UPDATE/, () => ({ rows: [{ status: 'active' }] })]]));
    await updateOwnMentorProfile(userId, { paused: true });
    const update = sqlCalls().find((sql) => sql.includes('UPDATE mentor_profiles'))!;
    expect(update).not.toMatch(/\btier\b/);
    expect(sqlCalls().join('\n')).not.toContain('mentor_qualifications');
  });
});

describe('directory and mentor center reads', () => {
  it('lists only active, listed, unsuspended mentors with an active qualification and never selects email', async () => {
    await listMentorDirectory({});
    const sql = String(mocks.poolQuery.mock.calls[0][0]);
    expect(sql).toContain("profile.status='active'");
    expect(sql).toContain('profile.is_listed=true');
    expect(sql).toContain('account.suspended_at IS NULL');
    expect(sql).toContain("qualification.status='active'");
    expect(sql).not.toMatch(/email/);
  });

  it('ignores unknown specialization filters instead of interpolating them', async () => {
    await listMentorDirectory({ specializationId: "x' OR 1=1 --" });
    expect(mocks.poolQuery.mock.calls[0][1][0]).toBeNull();
  });

  it('never reads the internal reviewer note for the applicant', async () => {
    await getMentorCenterState(userId);
    const sql = mocks.poolQuery.mock.calls.map((call) => String(call[0])).join('\n');
    expect(sql).toContain('FROM mentor_applications');
    expect(sql).not.toContain('reviewer_note');
  });
});
