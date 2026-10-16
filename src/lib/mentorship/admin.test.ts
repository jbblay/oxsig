import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  clientQuery: vi.fn(),
  notify: vi.fn(),
}));

vi.mock('server-only', () => ({}));
vi.mock('@/lib/db/pool', () => ({
  getPool: () => ({ query: mocks.clientQuery }),
  transaction: async (callback: (client: { query: typeof mocks.clientQuery }) => unknown) => callback({ query: mocks.clientQuery }),
}));
vi.mock('@/lib/notifications/server', () => ({ createWorkspaceNotification: mocks.notify }));

import { decideMentorApplication, manageMentor } from './admin';

const adminId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const applicantId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const applicationId = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const LINUX = ['command-resolution', 'fork-copy-on-write', 'execve-elf', 'virtual-address-space', 'runtime-startup', 'process-context'];

type Respond = (params: unknown[]) => { rows: Record<string, unknown>[] };

function setup(options: { track?: 'academy' | 'external'; status?: string; applicant?: string; evidence?: string[]; profileInserted?: boolean; credentials?: unknown[] } = {}) {
  const handlers: Array<[RegExp, Respond]> = [
    [/FROM mentor_applications WHERE id=\$1 FOR UPDATE/, () => ({
      rows: [{
        id: applicationId,
        applicant_id: options.applicant ?? applicantId,
        track: options.track ?? 'academy',
        status: options.status ?? 'under_review',
        specializations: ['linux-systems', 'databases'],
        credentials: options.credentials ?? [{ name: 'RHCSA', issuer: 'Red Hat' }],
        headline: 'Headline here',
        bio: 'b'.repeat(90),
        timezone: 'UTC',
      }],
    })],
    [/capability_proof/, () => ({ rows: (options.evidence ?? []).map((capability_id) => ({ path_id: 'program-becomes-process', capability_id })) })],
    [/INSERT INTO mentor_profiles/, () => ({ rows: options.profileInserted === false ? [] : [{ user_id: applicantId }] })],
    [/SELECT .* FROM mentor_applications WHERE id=\$1$/s, () => ({ rows: [{ id: applicationId, track: options.track ?? 'academy', status: 'approved', specializations: [], credentials: [], submitted_at: new Date(), updated_at: new Date() }] })],
  ];
  mocks.clientQuery.mockImplementation(async (sql: string, params: unknown[] = []) => {
    for (const [pattern, respond] of handlers) if (pattern.test(sql)) return respond(params);
    return { rows: [{ id: applicationId, status: 'approved', specializations: [], credentials: [], submitted_at: new Date(), updated_at: new Date() }] };
  });
}

const calls = () => mocks.clientQuery.mock.calls.map((call) => ({ sql: String(call[0]), params: call[1] as unknown[] }));
const approve = (overrides: Record<string, unknown> = {}) => ({
  action: 'approve' as const,
  tier: 'approved_peer_mentor' as const,
  specializationIds: ['linux-systems'],
  verifiedCredentialIndexes: [] as number[],
  ...overrides,
});

beforeEach(() => {
  mocks.clientQuery.mockReset();
  mocks.notify.mockReset().mockResolvedValue(null);
});

describe('decideMentorApplication', () => {
  it('forbids administrators from reviewing their own application', async () => {
    setup({ applicant: adminId });
    await expect(decideMentorApplication({ adminId, applicationId, decision: approve() })).rejects.toMatchObject({ code: 'SELF_REVIEW_FORBIDDEN', status: 403 });
    expect(calls().some(({ sql }) => sql.includes('UPDATE mentor_applications'))).toBe(false);
  });

  it('re-checks Academy evidence at approval time', async () => {
    setup({ evidence: LINUX.slice(0, 2) });
    await expect(decideMentorApplication({ adminId, applicationId, decision: approve() })).rejects.toMatchObject({ code: 'EVIDENCE_REQUIRED' });
    expect(calls().some(({ sql }) => sql.includes('INSERT INTO mentor_profiles'))).toBe(false);
  });

  it('only lets Academy-grown mentors start as Approved Peer Mentors', async () => {
    setup({ evidence: LINUX });
    await expect(decideMentorApplication({ adminId, applicationId, decision: approve({ tier: 'senior_mentor' }) })).rejects.toMatchObject({ code: 'TIER_NOT_ALLOWED' });
  });

  it('only approves specializations the applicant requested', async () => {
    setup({ track: 'external' });
    await expect(decideMentorApplication({ adminId, applicationId, decision: approve({ specializationIds: ['cloud-aws'] }) })).rejects.toMatchObject({ code: 'SPECIALIZATION_NOT_REQUESTED' });
  });

  it('rejects verification of credentials that were never claimed', async () => {
    setup({ track: 'external' });
    await expect(decideMentorApplication({ adminId, applicationId, decision: approve({ verifiedCredentialIndexes: [3] }) })).rejects.toMatchObject({ code: 'CREDENTIAL_NOT_FOUND' });
  });

  it('approves with evidence: creates the profile, evidence-based qualifications, an event and a notification', async () => {
    setup({ evidence: LINUX });
    const outcome = await decideMentorApplication({ adminId, applicationId, decision: approve() });
    expect(outcome).toMatchObject({ from: 'under_review', to: 'approved', applicantId });
    const qualification = calls().find(({ sql }) => sql.includes('INSERT INTO mentor_qualifications'))!;
    expect(qualification.params.slice(0, 3)).toEqual([applicantId, 'linux-systems', 'academy_evidence']);
    expect(JSON.parse(qualification.params[3] as string)).toMatchObject({ specializationId: 'linux-systems', eligible: true, demonstrated: 6 });
    expect(calls().some(({ sql }) => sql.includes('INSERT INTO mentor_application_events'))).toBe(true);
    expect(mocks.notify).toHaveBeenCalledWith(expect.objectContaining({ ownerId: applicantId, type: 'mentor.application.approved' }));
  });

  it('publishes only reviewer-verified credentials for external professionals', async () => {
    setup({ track: 'external', credentials: [{ name: 'CCNP', issuer: 'Cisco' }, { name: 'Unverified', issuer: 'Somewhere' }] });
    await decideMentorApplication({ adminId, applicationId, decision: approve({ tier: 'verified_mentor', specializationIds: ['databases'], verifiedCredentialIndexes: [0] }) });
    const profile = calls().find(({ sql }) => sql.includes('INSERT INTO mentor_profiles'))!;
    const published = JSON.parse(profile.params[7] as string);
    expect(published).toHaveLength(1);
    expect(published[0]).toMatchObject({ name: 'CCNP', verifiedAt: expect.any(String) });
    const qualification = calls().find(({ sql }) => sql.includes('INSERT INTO mentor_qualifications'))!;
    expect(qualification.params[2]).toBe('professional_review');
  });

  it('refuses to overwrite an active or suspended mentor profile', async () => {
    setup({ evidence: LINUX, profileInserted: false });
    await expect(decideMentorApplication({ adminId, applicationId, decision: approve() })).rejects.toMatchObject({ code: 'PROFILE_EXISTS' });
  });

  it('enforces the state machine', async () => {
    setup({ status: 'withdrawn' });
    await expect(decideMentorApplication({ adminId, applicationId, decision: { action: 'reject', note: 'Not enough detail provided.' } })).rejects.toMatchObject({ code: 'INVALID_TRANSITION' });
    setup({ status: 'changes_requested' });
    await expect(decideMentorApplication({ adminId, applicationId, decision: approve() })).rejects.toMatchObject({ code: 'INVALID_TRANSITION' });
  });
});

describe('manageMentor', () => {
  it('forbids administrators from managing their own mentor profile', async () => {
    await expect(manageMentor({ adminId, mentorId: adminId, command: { action: 'set_tier', tier: 'senior_mentor', reason: 'Promote myself' } })).rejects.toMatchObject({ code: 'SELF_MANAGEMENT_FORBIDDEN' });
    expect(mocks.clientQuery).not.toHaveBeenCalled();
  });

  it('revoking a mentor also revokes every active qualification', async () => {
    mocks.clientQuery.mockImplementation(async (sql: string) =>
      /FROM mentor_profiles WHERE user_id=\$1 FOR UPDATE/.test(sql)
        ? { rows: [{ user_id: applicantId, track: 'external', tier: 'verified_mentor', status: 'active' }] }
        : { rows: [] }
    );
    await expect(manageMentor({ adminId, mentorId: applicantId, command: { action: 'revoke', reason: 'Conduct violation' } })).resolves.toEqual({ status: 'revoked' });
    expect(calls().some(({ sql }) => sql.includes("UPDATE mentor_qualifications SET status='revoked'"))).toBe(true);
  });

  it('re-checks Academy evidence before granting an extra qualification', async () => {
    mocks.clientQuery.mockImplementation(async (sql: string) =>
      /FROM mentor_profiles WHERE user_id=\$1 FOR UPDATE/.test(sql)
        ? { rows: [{ user_id: applicantId, track: 'academy', tier: 'approved_peer_mentor', status: 'active' }] }
        : { rows: [] }
    );
    await expect(manageMentor({ adminId, mentorId: applicantId, command: { action: 'grant_qualification', specializationId: 'linux-systems', reason: 'Expand scope' } })).rejects.toMatchObject({ code: 'EVIDENCE_REQUIRED' });
  });
});
