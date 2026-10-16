import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ query: vi.fn(), notify: vi.fn() }));

vi.mock('server-only', () => ({}));
vi.mock('@/lib/db/pool', () => ({
  getPool: () => ({ query: mocks.query }),
  transaction: async (callback: (client: { query: typeof mocks.query }) => unknown) => callback({ query: mocks.query }),
}));
vi.mock('@/lib/notifications/server', () => ({ createWorkspaceNotification: mocks.notify }));

import { applySessionCommand, bookMentorshipSession, openRescueRoom } from './sessions';

const learnerId = '11111111-1111-4111-8111-111111111111';
const mentorId = '22222222-2222-4222-8222-222222222222';
const offeringId = '33333333-3333-4333-8333-333333333333';
const sessionId = '44444444-4444-4444-8444-444444444444';
const roomId = '55555555-5555-4555-8555-555555555555';
const strangerId = '66666666-6666-4666-8666-666666666666';

const booking = {
  mentorId,
  offeringId,
  specializationId: 'linux-systems' as const,
  startsAt: '2026-10-19T09:00:00.000Z', // Monday
  learnerTimezone: 'Europe/London',
  topic: 'fork and exec',
  learnerGoal: 'Understand what execve replaces',
  attemptedSummary: '',
  shareAcademyContext: false,
};

type Rows = Record<string, unknown>[];
type Handler = [RegExp, (params: unknown[]) => { rows: Rows; rowCount?: number } | Promise<never>];

const sessionRow = (overrides: Record<string, unknown> = {}) => ({
  id: sessionId,
  learner_id: learnerId,
  mentor_id: mentorId,
  offering_id: offeringId,
  rescheduled_from: null,
  collaboration_id: null,
  kind: 'guided_coaching',
  duration_minutes: 30,
  specialization_id: 'linux-systems',
  status: 'requested',
  starts_at: '2026-10-19T09:00:00.000Z',
  ends_at: '2026-10-19T09:30:00.000Z',
  learner_timezone: 'UTC',
  topic: 'fork and exec',
  learner_goal: 'Understand what execve replaces',
  attempted_summary: '',
  shared_context: {},
  closed_at: null,
  created_at: '2026-10-18T12:00:00.000Z',
  counterpart_id: mentorId,
  counterpart_name: 'Mentor',
  ...overrides,
});

function install(overrides: Handler[] = [], session = sessionRow()) {
  const handlers: Handler[] = [
    ...overrides,
    [/pg_advisory_xact_lock/, () => ({ rows: [] })],
    [/SET status='expired'/, () => ({ rows: [] })],
    [/SELECT session\.collaboration_id/, () => ({ rows: [] })],
    [/FROM mentor_profiles profile\s+JOIN users account/, () => ({ rows: [{ user_id: mentorId, status: 'active', is_listed: true, timezone: 'UTC' }] })],
    [/FROM mentor_session_offerings WHERE id=\$1 AND mentor_id=\$2 AND is_active=true/, () => ({
      rows: [{ id: offeringId, kind: 'guided_coaching', title: 'Coaching', description: '', duration_minutes: 30, specialization_ids: ['linux-systems'], is_active: true }],
    })],
    [/FROM mentor_qualifications/, () => ({ rows: [{ id: 'q1', mentor_id: mentorId, specialization_id: 'linux-systems', basis: 'academy_evidence', granted_at: '2026-01-01' }] })],
    [/FROM mentor_availability_rules/, () => ({ rows: [{ weekday: 1, start_minute: 540, end_minute: 720 }] })],
    [/COUNT\(\*\)::int AS count FROM mentorship_sessions/, () => ({ rows: [{ count: 0 }] })],
    [/tstzrange/, () => ({ rows: [] })],
    [/INSERT INTO mentorship_sessions /, () => ({ rows: [{ id: sessionId }] })],
    [/SELECT learner_id, mentor_id FROM mentorship_sessions/, (params) => ({
      rows: params[1] === learnerId || params[1] === mentorId ? [{ learner_id: session.learner_id, mentor_id: session.mentor_id }] : [],
    })],
    [/SELECT \* FROM mentorship_sessions WHERE id=\$1 AND \(learner_id=\$2 OR mentor_id=\$2\) FOR UPDATE/, (params) => ({
      rows: params[1] === learnerId || params[1] === mentorId ? [session] : [],
    })],
    [/INSERT INTO collaborations/, () => ({ rows: [{ id: roomId }] })],
    [/FROM mentorship_sessions session\s+LEFT JOIN users counterpart/, () => ({ rows: [session] })],
  ];
  mocks.query.mockImplementation(async (sql: string, params: unknown[] = []) => {
    for (const [pattern, respond] of handlers) if (pattern.test(sql)) return respond(params);
    return { rows: [] };
  });
}

const sql = () => mocks.query.mock.calls.map((call) => ({ text: String(call[0]), params: (call[1] ?? []) as unknown[] }));

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-10-18T12:00:00Z'));
  mocks.query.mockReset();
  mocks.notify.mockReset().mockResolvedValue(null);
});
afterEach(() => vi.useRealTimers());

describe('bookMentorshipSession', () => {
  it('books a free session inside availability and notifies the mentor', async () => {
    install();
    const session = await bookMentorshipSession(learnerId, booking);
    expect(session.id).toBe(sessionId);
    const insert = sql().find((call) => call.text.includes('INSERT INTO mentorship_sessions '))!;
    expect(insert.params.slice(0, 2)).toEqual([learnerId, mentorId]);
    expect(insert.text).not.toMatch(/price_cents/);
    expect(mocks.notify).toHaveBeenCalledWith(expect.objectContaining({ ownerId: mentorId, type: 'mentorship.session.requested' }));
  });

  it('takes per-user advisory locks in sorted order before checking for overlaps', async () => {
    install();
    await bookMentorshipSession(learnerId, booking);
    const calls = sql();
    const locks = calls.filter((call) => call.text.includes('pg_advisory_xact_lock')).map((call) => call.params[0]);
    expect(locks).toEqual([learnerId, mentorId].sort());
    const firstLock = calls.findIndex((call) => call.text.includes('pg_advisory_xact_lock'));
    const overlap = calls.findIndex((call) => call.text.includes('tstzrange'));
    expect(firstLock).toBeLessThan(overlap);
    // The overlap check covers both people in both roles.
    expect(calls[overlap].params[0]).toEqual([learnerId, mentorId]);
    expect(calls[overlap].text).toContain('mentor_id = ANY($1::uuid[]) OR learner_id = ANY($1::uuid[])');
  });

  it('refuses double bookings', async () => {
    install([[/tstzrange/, () => ({ rows: [{ starts_at: booking.startsAt, ends_at: '2026-10-19T09:30:00.000Z' }] })]]);
    await expect(bookMentorshipSession(learnerId, booking)).rejects.toMatchObject({ code: 'SLOT_TAKEN' });
    expect(sql().some((call) => call.text.includes('INSERT INTO mentorship_sessions '))).toBe(false);
  });

  it('maps the database slot backstop to SLOT_TAKEN', async () => {
    install([[/INSERT INTO mentorship_sessions /, () => Promise.reject(Object.assign(new Error('dup'), { code: '23505' }))]]);
    await expect(bookMentorshipSession(learnerId, booking)).rejects.toMatchObject({ code: 'SLOT_TAKEN' });
  });

  it('refuses self-booking, unqualified specializations and times outside availability', async () => {
    install();
    await expect(bookMentorshipSession(mentorId, booking)).rejects.toMatchObject({ code: 'SELF_BOOKING' });

    install([[/FROM mentor_qualifications/, () => ({ rows: [] })]]);
    await expect(bookMentorshipSession(learnerId, booking)).rejects.toMatchObject({ code: 'MENTOR_NOT_QUALIFIED' });

    install();
    await expect(bookMentorshipSession(learnerId, { ...booking, startsAt: '2026-10-19T13:00:00.000Z' })).rejects.toMatchObject({ code: 'OUTSIDE_AVAILABILITY' });
  });

  it('refuses unavailable mentors and enforces the pilot session limit', async () => {
    install([[/FROM mentor_profiles profile\s+JOIN users account/, () => ({ rows: [{ user_id: mentorId, status: 'paused', is_listed: true, timezone: 'UTC' }] })]]);
    await expect(bookMentorshipSession(learnerId, booking)).rejects.toMatchObject({ code: 'MENTOR_UNAVAILABLE' });

    install([[/COUNT\(\*\)::int AS count FROM mentorship_sessions/, () => ({ rows: [{ count: 3 }] })]]);
    await expect(bookMentorshipSession(learnerId, booking)).rejects.toMatchObject({ code: 'SESSION_LIMIT' });
  });

  it('derives shared Academy context on the server and never includes terminal output', async () => {
    install([[/FROM academy_courses course/, () => ({
      rows: [{
        course_title: 'How a program becomes a process',
        active_index: 0,
        lessons: [{ title: 'execve', summary: 'Replacing the image', practice: { title: 'Trace exec', instruction: 'Run strace', command: 'strace -f ls', expected: 'execve(' } }],
      }],
    })]]);
    await bookMentorshipSession(learnerId, { ...booking, shareAcademyContext: true });
    const insert = sql().find((call) => call.text.includes('INSERT INTO mentorship_sessions '))!;
    const context = JSON.parse(insert.params[13] as string);
    expect(context).toMatchObject({ type: 'academy_lesson', lessonTitle: 'execve', practiceInstruction: 'Run strace' });
    expect(JSON.stringify(context)).not.toMatch(/strace -f ls|stdout|execve\(/);
  });
});

describe('applySessionCommand', () => {
  it('hides sessions from non-participants', async () => {
    install();
    await expect(applySessionCommand(strangerId, sessionId, { action: 'cancel', reason: 'nope' })).rejects.toMatchObject({ code: 'SESSION_NOT_FOUND', status: 404 });
  });

  it('does not let the learner confirm their own request', async () => {
    install();
    await expect(applySessionCommand(learnerId, sessionId, { action: 'confirm' })).rejects.toMatchObject({ code: 'INVALID_SESSION_ACTION' });
  });

  it('cancelling a session with a room revokes control leases and removes the mentor', async () => {
    install([], sessionRow({ status: 'confirmed', confirmed_at: '2026-10-18T10:00:00Z', collaboration_id: roomId }));
    await applySessionCommand(learnerId, sessionId, { action: 'cancel', reason: 'Fixed it myself' });
    const texts = sql().map((call) => call.text);
    expect(texts.some((text) => text.includes('UPDATE live_workspace_control_leases') && text.includes("status='revoked'"))).toBe(true);
    expect(texts.some((text) => text.includes("UPDATE live_workspaces SET status='ended'"))).toBe(true);
    expect(texts.some((text) => text.includes("UPDATE collaboration_members SET status='removed'") && text.includes("role<>'owner'"))).toBe(true);
    expect(mocks.notify).toHaveBeenCalledWith(expect.objectContaining({ ownerId: mentorId, type: 'mentorship.session.cancelled' }));
  });
});

describe('openRescueRoom', () => {
  it('is closed outside the session window', async () => {
    install([], sessionRow({ status: 'confirmed', confirmed_at: '2026-10-18T10:00:00Z' }));
    await expect(openRescueRoom(learnerId, sessionId)).rejects.toMatchObject({ code: 'ROOM_NOT_OPEN' });
  });

  it('creates a learner-owned, time-limited room with the mentor as instructor', async () => {
    vi.setSystemTime(new Date('2026-10-19T08:55:00Z'));
    install([], sessionRow({ status: 'confirmed', confirmed_at: '2026-10-18T10:00:00Z' }));
    const room = await openRescueRoom(mentorId, sessionId);
    expect(room).toEqual({ workspaceId: roomId, href: `/live?workspace=${roomId}` });
    const calls = sql();
    expect(calls.find((call) => call.text.includes('INSERT INTO collaborations'))!.params[2]).toBe(learnerId);
    const workspace = calls.find((call) => call.text.includes('INSERT INTO live_workspaces'))!;
    expect(workspace.params[2]).toBe('2026-10-19T09:40:00.000Z');
    const participants = calls.find((call) => call.text.includes('INSERT INTO live_workspace_participants'))!;
    expect(participants.text).toContain("'owner'");
    expect(participants.text).toContain("'instructor'");
    expect(participants.params).toEqual([roomId, learnerId, mentorId]);
    // No resources are attached automatically; the learner shares explicitly.
    expect(calls.some((call) => call.text.includes('live_workspace_resources'))).toBe(false);
  });
});
