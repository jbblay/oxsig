import 'server-only';

import type { PoolClient } from 'pg';
import { getPool, transaction } from '@/lib/db/pool';
import { stringifyPostgresJson } from '@/lib/db/postgres-safe';
import { createWorkspaceNotification } from '@/lib/notifications/server';
import { isValidTimeZone } from './policy';
import {
  ACTIVE_SESSION_STATUSES,
  AVAILABILITY_PREVIEW_DAYS,
  BOOKING_HORIZON_DAYS,
  MAX_ACTIVE_LEARNER_SESSIONS,
  SESSION_KIND_LABELS,
  bookingWindowError,
  generateOpenSlots,
  isLateCancellation,
  roomWindow,
  sessionActionError,
  slotFitsAvailability,
  type AvailabilityRule,
  type BookingInput,
  type Interval,
  type OfferingInput,
  type SessionAction,
  type SessionRole,
  type SessionStatus,
} from './scheduling';
import { MentorshipError, PUBLIC_MENTOR_PROFILE_SQL, loadActiveQualifications, mapOffering, type Queryable } from './server';
import { mentorSpecializationLabel } from './specializations';
import type { MentorAvailabilityView, MentorScheduleState, MentorshipSessionView, SharedSessionContext } from './types';

/*
 * Free mentorship: offerings, weekly availability, booking with double-booking
 * protection, the session lifecycle, and time-limited Rescue Rooms built on
 * the existing Live Workspace. Every function derives the actor's role from
 * the database row, never from client input.
 */

const iso = (value: unknown) => new Date(value as string).toISOString();
const MAX_ACTIVE_OFFERINGS = 6;
const ROOM_CLOSE_REASON = 'mentorship-session-closed';

/* ---------------------------------------------------------------- helpers */

/** Serialise booking decisions per user (as mentor or learner), deadlock-free by sorted order. */
async function lockUsers(client: Queryable, userIds: string[]) {
  for (const id of [...new Set(userIds)].sort()) {
    await client.query(`SELECT pg_advisory_xact_lock(hashtext('oxsig-mentorship:' || $1::text))`, [id]);
  }
}

async function recordSessionEvent(
  client: Queryable,
  event: { sessionId: string; actorId: string | null; type: string; from?: SessionStatus | null; to?: SessionStatus | null; detail?: string | null }
) {
  await client.query(
    `INSERT INTO mentorship_session_events (session_id, actor_id, event_type, from_status, to_status, detail)
     VALUES ($1,$2,$3,$4,$5,$6)`,
    [event.sessionId, event.actorId, event.type, event.from ?? null, event.to ?? null, event.detail?.slice(0, 500) ?? null]
  );
}

async function notify(ownerId: string | null, sessionId: string, type: string, title: string, detail?: string) {
  if (!ownerId) return;
  try {
    await createWorkspaceNotification({
      ownerId,
      type: `mentorship.session.${type}`,
      title,
      detail: detail ?? 'Open My sessions for details.',
      href: '/academy/sessions',
      severity: type === 'cancelled' || type === 'declined' ? 'warning' : 'info',
      sourceType: 'mentorship-session',
      sourceId: sessionId,
      dedupeKey: `mentorship-session:${sessionId}:${type}:${Date.now()}`,
    });
  } catch (error) {
    console.warn('Mentorship notification failed:', error);
  }
}

async function loadActiveMentorProfile(client: Queryable, mentorId: string, options: { requirePublic: boolean }) {
  const result = await client.query(
    `SELECT profile.user_id, profile.status, profile.is_listed, profile.timezone
       FROM mentor_profiles profile
       JOIN users account ON account.id=profile.user_id
      WHERE profile.user_id=$1 AND account.is_active=true AND account.suspended_at IS NULL
      LIMIT 1`,
    [mentorId]
  );
  const row = result.rows[0] as { user_id: string; status: string; is_listed: boolean; timezone: string } | undefined;
  if (!row) return null;
  if (options.requirePublic && (row.status !== 'active' || !row.is_listed)) return null;
  if (!options.requirePublic && row.status !== 'active' && row.status !== 'paused') return null;
  return row;
}

async function loadRules(client: Queryable, mentorId: string): Promise<AvailabilityRule[]> {
  const result = await client.query(
    `SELECT weekday, start_minute, end_minute FROM mentor_availability_rules WHERE mentor_id=$1 ORDER BY weekday, start_minute`,
    [mentorId]
  );
  return result.rows.map((row) => ({ weekday: Number(row.weekday), startMinute: Number(row.start_minute), endMinute: Number(row.end_minute) }));
}

/** Live bookings for any of the users, in either role, overlapping the window. Details are never returned to callers. */
async function loadBusy(client: Queryable, userIds: string[], from: Date, to: Date, excludeSessionId: string | null = null): Promise<Interval[]> {
  const result = await client.query(
    `SELECT starts_at, ends_at FROM mentorship_sessions
      WHERE (mentor_id = ANY($1::uuid[]) OR learner_id = ANY($1::uuid[]))
        AND status IN ('requested','confirmed')
        AND tstzrange(starts_at, ends_at, '[)') && tstzrange($2::timestamptz, $3::timestamptz, '[)')
        AND ($4::uuid IS NULL OR id <> $4::uuid)`,
    [userIds, from.toISOString(), to.toISOString(), excludeSessionId]
  );
  return result.rows.map((row) => ({ start: new Date(row.starts_at), end: new Date(row.ends_at) }));
}

/** Lazily retire requests nobody answered and sessions whose mentor account disappeared. */
async function sweepStaleSessions(client: Queryable, userIds: string[]) {
  const expired = await client.query(
    `UPDATE mentorship_sessions
        SET status='expired', closed_at=NOW(), updated_at=NOW()
      WHERE status='requested' AND starts_at <= NOW()
        AND (mentor_id = ANY($1::uuid[]) OR learner_id = ANY($1::uuid[]))
      RETURNING id`,
    [userIds]
  );
  for (const row of expired.rows) await recordSessionEvent(client, { sessionId: row.id, actorId: null, type: 'expired', from: 'requested', to: 'expired' });
  await client.query(
    `UPDATE mentorship_sessions
        SET status='cancelled', cancellation_reason='The mentor account is no longer available.', closed_at=NOW(), updated_at=NOW()
      WHERE mentor_id IS NULL AND status IN ('requested','confirmed') AND learner_id = ANY($1::uuid[])`,
    [userIds]
  );
  const endedRooms = await client.query(
    `SELECT session.collaboration_id
       FROM mentorship_sessions session
       JOIN live_workspaces workspace ON workspace.collaboration_id=session.collaboration_id AND workspace.status='active'
      WHERE (session.mentor_id = ANY($1::uuid[]) OR session.learner_id = ANY($1::uuid[]))
        AND (workspace.expires_at <= NOW() OR session.status NOT IN ('requested','confirmed'))`,
    [userIds]
  );
  for (const row of endedRooms.rows) await closeRescueRoom(client, row.collaboration_id, null);
}

/* -------------------------------------------------------- mentor schedule */

export async function getMentorSchedule(mentorId: string): Promise<MentorScheduleState> {
  const pool = getPool();
  const profile = await loadActiveMentorProfile(pool, mentorId, { requirePublic: false });
  if (!profile) throw new MentorshipError('Only active mentors can manage sessions.', 'NOT_A_MENTOR', 403);
  const [offerings, rules, qualifications] = await Promise.all([
    pool.query(
      `SELECT id, kind, title, description, duration_minutes, specialization_ids, is_active
         FROM mentor_session_offerings WHERE mentor_id=$1 ORDER BY is_active DESC, created_at ASC`,
      [mentorId]
    ),
    loadRules(pool, mentorId),
    loadActiveQualifications(pool, [mentorId]),
  ]);
  return {
    timezone: profile.timezone,
    offerings: offerings.rows.map(mapOffering),
    rules,
    qualifiedSpecializationIds: (qualifications.get(mentorId) ?? []).map((item) => item.specializationId),
  };
}

async function assertQualifiedFor(client: Queryable, mentorId: string, specializationIds: string[]) {
  const qualifications = await loadActiveQualifications(client, [mentorId]);
  const held = new Set((qualifications.get(mentorId) ?? []).map((item) => item.specializationId));
  const missing = specializationIds.filter((id) => !held.has(id));
  if (missing.length) {
    throw new MentorshipError(
      `You are not approved to mentor: ${missing.map(mentorSpecializationLabel).join(', ')}.`,
      'NOT_QUALIFIED',
      403,
      { specializations: missing }
    );
  }
}

export async function saveMentorOffering(mentorId: string, input: OfferingInput, offeringId: string | null) {
  return transaction(async (client) => {
    if (!(await loadActiveMentorProfile(client, mentorId, { requirePublic: false }))) {
      throw new MentorshipError('Only active mentors can manage sessions.', 'NOT_A_MENTOR', 403);
    }
    await assertQualifiedFor(client, mentorId, input.specializationIds);
    if (offeringId) {
      const updated = await client.query(
        `UPDATE mentor_session_offerings
            SET kind=$3, title=$4, description=$5, duration_minutes=$6, specialization_ids=$7::text[], updated_at=NOW()
          WHERE id=$1 AND mentor_id=$2
          RETURNING id, kind, title, description, duration_minutes, specialization_ids, is_active`,
        [offeringId, mentorId, input.kind, input.title, input.description, input.durationMinutes, input.specializationIds]
      );
      if (!updated.rows[0]) throw new MentorshipError('Offering not found.', 'OFFERING_NOT_FOUND', 404);
      return mapOffering(updated.rows[0]);
    }
    const count = await client.query(`SELECT COUNT(*)::int AS count FROM mentor_session_offerings WHERE mentor_id=$1 AND is_active=true`, [mentorId]);
    if (Number(count.rows[0]?.count) >= MAX_ACTIVE_OFFERINGS) {
      throw new MentorshipError(`Keep at most ${MAX_ACTIVE_OFFERINGS} active session types.`, 'OFFERING_LIMIT');
    }
    const inserted = await client.query(
      `INSERT INTO mentor_session_offerings (mentor_id, kind, title, description, duration_minutes, specialization_ids)
       VALUES ($1,$2,$3,$4,$5,$6::text[])
       RETURNING id, kind, title, description, duration_minutes, specialization_ids, is_active`,
      [mentorId, input.kind, input.title, input.description, input.durationMinutes, input.specializationIds]
    );
    return mapOffering(inserted.rows[0]);
  });
}

export async function setMentorOfferingActive(mentorId: string, offeringId: string, isActive: boolean) {
  const result = await getPool().query(
    `UPDATE mentor_session_offerings SET is_active=$3, updated_at=NOW() WHERE id=$1 AND mentor_id=$2
     RETURNING id, kind, title, description, duration_minutes, specialization_ids, is_active`,
    [offeringId, mentorId, isActive]
  );
  if (!result.rows[0]) throw new MentorshipError('Offering not found.', 'OFFERING_NOT_FOUND', 404);
  return mapOffering(result.rows[0]);
}

/** Replaces weekly availability. Existing bookings are kept; only future booking is affected. */
export async function replaceMentorAvailability(mentorId: string, rules: AvailabilityRule[]) {
  return transaction(async (client) => {
    if (!(await loadActiveMentorProfile(client, mentorId, { requirePublic: false }))) {
      throw new MentorshipError('Only active mentors can manage availability.', 'NOT_A_MENTOR', 403);
    }
    await client.query(`DELETE FROM mentor_availability_rules WHERE mentor_id=$1`, [mentorId]);
    for (const rule of rules) {
      await client.query(
        `INSERT INTO mentor_availability_rules (mentor_id, weekday, start_minute, end_minute) VALUES ($1,$2,$3,$4)`,
        [mentorId, rule.weekday, rule.startMinute, rule.endMinute]
      );
    }
    return loadRules(client, mentorId);
  });
}

/* ----------------------------------------------------- public availability */

async function loadBookableOffering(client: Queryable, mentorId: string, offeringId: string) {
  const result = await client.query(
    `SELECT id, kind, title, description, duration_minutes, specialization_ids, is_active
       FROM mentor_session_offerings WHERE id=$1 AND mentor_id=$2 AND is_active=true LIMIT 1`,
    [offeringId, mentorId]
  );
  return result.rows[0] ? mapOffering(result.rows[0]) : null;
}

export async function getMentorAvailability(viewerId: string, mentorId: string, offeringId: string): Promise<MentorAvailabilityView> {
  const pool = getPool();
  const visible = await pool.query(`${PUBLIC_MENTOR_PROFILE_SQL} AND profile.user_id=$2 LIMIT 1`, [null, mentorId]);
  if (!visible.rows[0]) throw new MentorshipError('Mentor not found.', 'MENTOR_NOT_FOUND', 404);
  const offering = await loadBookableOffering(pool, mentorId, offeringId);
  if (!offering) throw new MentorshipError('This session type is not available.', 'OFFERING_NOT_FOUND', 404);
  const now = new Date();
  const horizon = new Date(now.getTime() + AVAILABILITY_PREVIEW_DAYS * 86_400_000);
  const [rules, busy] = await Promise.all([
    loadRules(pool, mentorId),
    // The viewer's own bookings are excluded too, so they cannot double-book themselves.
    loadBusy(pool, mentorId === viewerId ? [mentorId] : [mentorId, viewerId], now, horizon),
  ]);
  const timezone = visible.rows[0].timezone as string;
  return {
    mentorTimezone: timezone,
    offering,
    slots: mentorId === viewerId ? [] : generateOpenSlots({ rules, timeZone: timezone, durationMinutes: offering.durationMinutes, busy, now }).map((slot) => slot.toISOString()),
  };
}

/* ---------------------------------------------------------------- booking */

async function resolveAcademyContext(client: Queryable, learnerId: string): Promise<SharedSessionContext> {
  const result = await client.query(
    `SELECT course.course_data->>'title' AS course_title,
            COALESCE(progress.active_lesson_index, 0) AS active_index,
            course.course_data->'lessons' AS lessons
       FROM academy_courses course
       LEFT JOIN academy_progress progress ON progress.course_id=course.id AND progress.owner_id=course.owner_id
      WHERE course.owner_id=$1 AND course.status='active'
      ORDER BY course.created_at DESC
      LIMIT 1`,
    [learnerId]
  );
  const row = result.rows[0];
  const lessons = Array.isArray(row?.lessons) ? row.lessons : [];
  const lesson = lessons[Math.min(Math.max(Number(row?.active_index) || 0, 0), Math.max(lessons.length - 1, 0))];
  if (!row || !lesson) throw new MentorshipError('You have no active Academy lesson to share.', 'NO_ACADEMY_CONTEXT', 409);
  const clip = (value: unknown, max: number) => (typeof value === 'string' ? value.slice(0, max) : '');
  // Only curriculum text is shared: never commands run, terminal output, or lab identifiers.
  return {
    type: 'academy_lesson',
    courseTitle: clip(row.course_title, 160),
    lessonTitle: clip(lesson.title, 160),
    lessonSummary: clip(lesson.summary, 600),
    practiceTitle: lesson.practice ? clip(lesson.practice.title, 160) : null,
    practiceInstruction: lesson.practice ? clip(lesson.practice.instruction, 600) : null,
    sharedAt: new Date().toISOString(),
  };
}

async function createBooking(
  client: PoolClient,
  learnerId: string,
  input: BookingInput,
  options: { excludeSessionId: string | null; rescheduledFrom: string | null; context: SharedSessionContext | null }
) {
  if (input.mentorId === learnerId) throw new MentorshipError('You cannot book a session with yourself.', 'SELF_BOOKING', 400);
  if (!isValidTimeZone(input.learnerTimezone)) throw new MentorshipError('Choose a valid time zone.', 'INVALID_TIMEZONE', 400);
  const startsAt = new Date(input.startsAt);
  const windowError = bookingWindowError(startsAt);
  if (windowError) throw new MentorshipError(windowError, 'INVALID_TIME', 400);

  await lockUsers(client, [learnerId, input.mentorId]);
  await sweepStaleSessions(client, [learnerId, input.mentorId]);

  const mentor = await loadActiveMentorProfile(client, input.mentorId, { requirePublic: true });
  if (!mentor) throw new MentorshipError('This mentor is not accepting bookings.', 'MENTOR_UNAVAILABLE', 409);
  const offering = await loadBookableOffering(client, input.mentorId, input.offeringId);
  if (!offering) throw new MentorshipError('This session type is not available.', 'OFFERING_NOT_FOUND', 404);
  if (!offering.specializationIds.includes(input.specializationId)) {
    throw new MentorshipError('This session type does not cover that specialization.', 'SPECIALIZATION_NOT_OFFERED', 400);
  }
  // Qualification restriction: a mentor may only be booked for specializations they currently hold.
  const qualifications = await loadActiveQualifications(client, [input.mentorId]);
  if (!(qualifications.get(input.mentorId) ?? []).some((item) => item.specializationId === input.specializationId)) {
    throw new MentorshipError('This mentor is not approved for that specialization.', 'MENTOR_NOT_QUALIFIED', 409);
  }

  const rules = await loadRules(client, input.mentorId);
  if (!slotFitsAvailability(startsAt, offering.durationMinutes, rules, mentor.timezone)) {
    throw new MentorshipError('That time is outside the mentor\u2019s availability.', 'OUTSIDE_AVAILABILITY', 409);
  }
  const endsAt = new Date(startsAt.getTime() + offering.durationMinutes * 60_000);

  const active = await client.query(
    `SELECT COUNT(*)::int AS count FROM mentorship_sessions
      WHERE learner_id=$1 AND status IN ('requested','confirmed') AND ends_at > NOW()
        AND ($2::uuid IS NULL OR id <> $2::uuid)`,
    [learnerId, options.excludeSessionId]
  );
  if (Number(active.rows[0]?.count) >= MAX_ACTIVE_LEARNER_SESSIONS) {
    throw new MentorshipError(`You can hold at most ${MAX_ACTIVE_LEARNER_SESSIONS} upcoming sessions during the free pilot.`, 'SESSION_LIMIT', 409);
  }

  const busy = await loadBusy(client, [learnerId, input.mentorId], startsAt, endsAt, options.excludeSessionId);
  if (busy.length) throw new MentorshipError('That time was just taken. Choose another slot.', 'SLOT_TAKEN', 409);

  try {
    await client.query('SAVEPOINT mentorship_booking');
    const inserted = await client.query(
      `INSERT INTO mentorship_sessions (
         learner_id, mentor_id, offering_id, rescheduled_from, kind, duration_minutes, specialization_id,
         starts_at, ends_at, learner_timezone, topic, learner_goal, attempted_summary, shared_context
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14::jsonb)
       RETURNING id`,
      [
        learnerId,
        input.mentorId,
        offering.id,
        options.rescheduledFrom,
        offering.kind,
        offering.durationMinutes,
        input.specializationId,
        startsAt.toISOString(),
        endsAt.toISOString(),
        input.learnerTimezone,
        input.topic,
        input.learnerGoal,
        input.attemptedSummary,
        stringifyPostgresJson(options.context ?? {}),
      ]
    );
    await client.query('RELEASE SAVEPOINT mentorship_booking');
    const sessionId = inserted.rows[0].id as string;
    await recordSessionEvent(client, { sessionId, actorId: learnerId, type: options.rescheduledFrom ? 'rescheduled_booking' : 'booked', to: 'requested' });
    return { sessionId, offering, startsAt };
  } catch (error) {
    if ((error as { code?: string }).code === '23505') {
      await client.query('ROLLBACK TO SAVEPOINT mentorship_booking');
      throw new MentorshipError('That time was just taken. Choose another slot.', 'SLOT_TAKEN', 409);
    }
    throw error;
  }
}

export async function bookMentorshipSession(learnerId: string, input: BookingInput) {
  const result = await transaction(async (client) => {
    const context = input.shareAcademyContext ? await resolveAcademyContext(client, learnerId) : null;
    return createBooking(client, learnerId, input, { excludeSessionId: null, rescheduledFrom: null, context });
  });
  await notify(
    input.mentorId,
    result.sessionId,
    'requested',
    `New ${SESSION_KIND_LABELS[result.offering.kind].toLowerCase()} request`,
    `${mentorSpecializationLabel(input.specializationId)} · ${result.startsAt.toISOString().replace('T', ' ').slice(0, 16)} UTC`
  );
  return getMentorshipSession(learnerId, result.sessionId);
}

/* -------------------------------------------------------------- lifecycle */

type SessionRow = Record<string, any> & { id: string; learner_id: string; mentor_id: string | null; status: SessionStatus };

/**
 * Lock order is always: per-user advisory locks (sorted) → session row. Booking
 * takes the same advisory locks first, so the two paths cannot deadlock.
 */
async function lockSessionFor(client: Queryable, userId: string, sessionId: string) {
  const participants = await client.query(
    `SELECT learner_id, mentor_id FROM mentorship_sessions WHERE id=$1 AND (learner_id=$2 OR mentor_id=$2)`,
    [sessionId, userId]
  );
  const people = participants.rows[0] as { learner_id: string; mentor_id: string | null } | undefined;
  if (!people) throw new MentorshipError('Session not found.', 'SESSION_NOT_FOUND', 404);
  await lockUsers(client, [people.learner_id, people.mentor_id].filter(Boolean) as string[]);
  const result = await client.query(
    `SELECT * FROM mentorship_sessions WHERE id=$1 AND (learner_id=$2 OR mentor_id=$2) FOR UPDATE`,
    [sessionId, userId]
  );
  const row = result.rows[0] as SessionRow | undefined;
  // Other people's sessions are indistinguishable from missing ones.
  if (!row) throw new MentorshipError('Session not found.', 'SESSION_NOT_FOUND', 404);
  const role: SessionRole = row.learner_id === userId ? 'learner' : 'mentor';
  return { row, role };
}

function snapshot(row: SessionRow) {
  return { status: row.status, startsAt: new Date(row.starts_at), endsAt: new Date(row.ends_at), closedAt: row.closed_at ? new Date(row.closed_at) : null };
}

export type SessionCommand =
  | { action: 'confirm'; note?: string }
  | { action: 'decline'; reason: string }
  | { action: 'cancel'; reason: string }
  | { action: 'complete'; summary?: string }
  | { action: 'no_show' }
  | { action: 'summary'; summary: string }
  | { action: 'reschedule'; startsAt: string };

export async function applySessionCommand(userId: string, sessionId: string, command: SessionCommand) {
  const outcome = await transaction(async (client) => {
    const { row, role } = await lockSessionFor(client, userId, sessionId);
    const refusal = sessionActionError(command.action, role, snapshot(row));
    if (refusal) throw new MentorshipError(refusal, 'INVALID_SESSION_ACTION', 409);
    const counterpart = role === 'learner' ? row.mentor_id : row.learner_id;
    const from = row.status;

    switch (command.action) {
      case 'confirm': {
        if (!row.mentor_id || !(await loadActiveMentorProfile(client, row.mentor_id, { requirePublic: false }))) {
          throw new MentorshipError('Your mentor profile is not active.', 'NOT_A_MENTOR', 403);
        }
        await client.query(
          `UPDATE mentorship_sessions SET status='confirmed', confirmed_at=NOW(), mentor_note=$2, updated_at=NOW() WHERE id=$1`,
          [sessionId, command.note?.trim() || null]
        );
        await recordSessionEvent(client, { sessionId, actorId: userId, type: 'confirmed', from, to: 'confirmed' });
        return { counterpart, type: 'confirmed', title: 'Your mentorship session is confirmed' };
      }
      case 'decline':
        await client.query(
          `UPDATE mentorship_sessions SET status='declined', cancellation_reason=$2, cancelled_by=$3, closed_at=NOW(), updated_at=NOW() WHERE id=$1`,
          [sessionId, command.reason, userId]
        );
        await recordSessionEvent(client, { sessionId, actorId: userId, type: 'declined', from, to: 'declined', detail: command.reason });
        return { counterpart, type: 'declined', title: 'A mentor could not take your session request' };
      case 'cancel': {
        const late = from === 'confirmed' && isLateCancellation(new Date(row.starts_at));
        await client.query(
          `UPDATE mentorship_sessions
              SET status='cancelled', cancellation_reason=$2, cancelled_by=$3, late_cancellation=$4, closed_at=NOW(), updated_at=NOW()
            WHERE id=$1`,
          [sessionId, command.reason, userId, late]
        );
        if (row.collaboration_id) await closeRescueRoom(client, row.collaboration_id, userId);
        await recordSessionEvent(client, { sessionId, actorId: userId, type: 'cancelled', from, to: 'cancelled', detail: command.reason });
        return { counterpart, type: 'cancelled', title: `Your mentorship session was cancelled by the ${role}` };
      }
      case 'complete':
        await client.query(
          `UPDATE mentorship_sessions SET status='completed', mentor_summary=COALESCE($2, mentor_summary), closed_at=NOW(), updated_at=NOW() WHERE id=$1`,
          [sessionId, command.summary?.trim() || null]
        );
        if (row.collaboration_id) await closeRescueRoom(client, row.collaboration_id, userId);
        await recordSessionEvent(client, { sessionId, actorId: userId, type: 'completed', from, to: 'completed' });
        return { counterpart, type: 'completed', title: 'Your mentorship session was completed' };
      case 'no_show':
        await client.query(`UPDATE mentorship_sessions SET status='no_show', closed_at=NOW(), updated_at=NOW() WHERE id=$1`, [sessionId]);
        if (row.collaboration_id) await closeRescueRoom(client, row.collaboration_id, userId);
        await recordSessionEvent(client, { sessionId, actorId: userId, type: 'no_show', from, to: 'no_show' });
        return { counterpart, type: 'no_show', title: 'A mentorship session was recorded as a no-show' };
      case 'summary':
        await client.query(`UPDATE mentorship_sessions SET mentor_summary=$2, updated_at=NOW() WHERE id=$1`, [sessionId, command.summary.trim()]);
        await recordSessionEvent(client, { sessionId, actorId: userId, type: 'summary_updated' });
        return { counterpart, type: 'summary', title: 'Your mentor added a session summary' };
      case 'reschedule': {
        if (!row.mentor_id) throw new MentorshipError('The mentor is no longer available.', 'MENTOR_UNAVAILABLE', 409);
        if (!row.offering_id) throw new MentorshipError('This session type is no longer offered. Book a new session instead.', 'OFFERING_NOT_FOUND', 409);
        // Release the old slot first (same transaction): if the new booking fails, both roll back.
        await client.query(
          `UPDATE mentorship_sessions
              SET status='cancelled', cancellation_reason='Rescheduled by the learner', cancelled_by=$2, closed_at=NOW(), updated_at=NOW()
            WHERE id=$1`,
          [sessionId, userId]
        );
        const booking = await createBooking(
          client,
          userId,
          {
            mentorId: row.mentor_id,
            offeringId: row.offering_id,
            specializationId: row.specialization_id,
            startsAt: command.startsAt,
            learnerTimezone: row.learner_timezone,
            topic: row.topic,
            learnerGoal: row.learner_goal,
            attemptedSummary: row.attempted_summary,
            shareAcademyContext: false,
          },
          { excludeSessionId: sessionId, rescheduledFrom: sessionId, context: row.shared_context?.type ? row.shared_context : null }
        );
        if (row.collaboration_id) await closeRescueRoom(client, row.collaboration_id, userId);
        await recordSessionEvent(client, { sessionId, actorId: userId, type: 'rescheduled', from, to: 'cancelled', detail: booking.sessionId });
        return { counterpart, type: 'rescheduled', title: 'A learner asked to reschedule a session', newSessionId: booking.sessionId };
      }
    }
  });
  await notify(outcome.counterpart, 'newSessionId' in outcome && outcome.newSessionId ? outcome.newSessionId : sessionId, outcome.type, outcome.title);
  return getMentorshipSession(userId, 'newSessionId' in outcome && outcome.newSessionId ? outcome.newSessionId : sessionId);
}

/** Admin suspension or revocation: cancel the mentor's upcoming sessions and close their rooms. */
export async function cancelMentorSessionsForStatusChange(client: Queryable, mentorId: string, adminId: string, reason: string) {
  const affected = await client.query(
    `UPDATE mentorship_sessions
        SET status='cancelled', cancellation_reason=$3, cancelled_by=$2, closed_at=NOW(), updated_at=NOW()
      WHERE mentor_id=$1 AND status IN ('requested','confirmed') AND ends_at > NOW()
      RETURNING id, learner_id, collaboration_id`,
    [mentorId, adminId, 'The mentor is no longer available. ' + reason.slice(0, 300)]
  );
  for (const row of affected.rows) {
    if (row.collaboration_id) await closeRescueRoom(client, row.collaboration_id, adminId);
    await recordSessionEvent(client, { sessionId: row.id, actorId: adminId, type: 'cancelled_by_platform', to: 'cancelled' });
  }
  return affected.rows.map((row) => ({ sessionId: row.id as string, learnerId: row.learner_id as string }));
}

export async function notifyLearnersOfPlatformCancellation(sessions: Array<{ sessionId: string; learnerId: string }>) {
  await Promise.all(sessions.map((item) => notify(item.learnerId, item.sessionId, 'cancelled', 'A mentorship session was cancelled by OXSIG')));
}

/* ---------------------------------------------------------- Rescue Rooms */

/**
 * Ends a Rescue Room: cancels pending control requests, revokes every lease
 * (the terminal bridge drops within its 2 s recheck), ends the workspace and
 * removes the mentor's membership. The learner keeps their own chat history.
 */
export async function closeRescueRoom(client: Queryable, collaborationId: string, actorId: string | null) {
  await client.query(
    `UPDATE live_workspace_control_requests
        SET status='cancelled', decided_at=NOW(), decided_by=$2, updated_at=NOW()
      WHERE collaboration_id=$1 AND status='pending'`,
    [collaborationId, actorId]
  );
  await client.query(
    `UPDATE live_workspace_control_leases
        SET status='revoked', revoked_at=NOW(), revoked_by=$2, revocation_reason=$3, updated_at=NOW()
      WHERE collaboration_id=$1 AND status='active'`,
    [collaborationId, actorId, ROOM_CLOSE_REASON]
  );
  await client.query(
    `UPDATE live_workspaces SET status='ended', ended_at=COALESCE(ended_at, NOW()), updated_at=NOW() WHERE collaboration_id=$1`,
    [collaborationId]
  );
  await client.query(`UPDATE collaborations SET status='ended', updated_at=NOW() WHERE id=$1`, [collaborationId]);
  await client.query(
    `UPDATE live_workspace_participants SET status='removed', updated_at=NOW() WHERE collaboration_id=$1 AND role<>'owner'`,
    [collaborationId]
  );
  await client.query(
    `UPDATE collaboration_members SET status='removed', last_active_at=NOW() WHERE collaboration_id=$1 AND role<>'owner'`,
    [collaborationId]
  );
}

export async function openRescueRoom(userId: string, sessionId: string) {
  const result = await transaction(async (client) => {
    const { row, role } = await lockSessionFor(client, userId, sessionId);
    const window = roomWindow(snapshot(row));
    if (!window.open) {
      throw new MentorshipError(
        row.status === 'confirmed' ? 'The Rescue Room opens 10 minutes before the session and closes when it ends.' : 'Only confirmed sessions have a Rescue Room.',
        'ROOM_NOT_OPEN',
        409
      );
    }
    if (!row.mentor_id || !(await loadActiveMentorProfile(client, row.mentor_id, { requirePublic: false }))) {
      throw new MentorshipError('The mentor is no longer available.', 'MENTOR_UNAVAILABLE', 409);
    }

    if (row.collaboration_id) {
      const existing = await client.query(
        `SELECT 1 FROM live_workspaces WHERE collaboration_id=$1 AND status='active' AND (expires_at IS NULL OR expires_at > NOW())`,
        [row.collaboration_id]
      );
      if (existing.rows[0]) {
        await client.query(`INSERT INTO mentorship_attendance(session_id,owner_id) VALUES($1,$2) ON CONFLICT DO NOTHING`,[sessionId,userId]);
        return { workspaceId: row.collaboration_id as string, created: false, role, counterpart: role === 'learner' ? row.mentor_id : row.learner_id };
      }
    }

    // The learner owns the room: they decide what to attach and who may control it.
    const created = await client.query(
      `INSERT INTO collaborations (name, description, owner_id, status, collaboration_type, settings)
       VALUES ($1,$2,$3,'active','live-workspace',$4::jsonb)
       RETURNING id`,
      [
        `Rescue Room · ${String(row.topic).slice(0, 120)}`,
        `Mentorship session · ${mentorSpecializationLabel(row.specialization_id)}. Only resources the learner attaches are visible. Closes automatically at ${window.expiresAt.toISOString().slice(11, 16)} UTC.`,
        row.learner_id,
        stringifyPostgresJson({ liveWorkspaceVersion: 1, mentorshipSessionId: sessionId }),
      ]
    );
    const workspaceId = created.rows[0].id as string;
    await client.query(
      `INSERT INTO collaboration_members (collaboration_id, user_id, role, permissions, status, invited_by)
       VALUES ($1,$2,'owner',$4::jsonb,'active',$2), ($1,$3,'member',$5::jsonb,'active',$2)`,
      [workspaceId, row.learner_id, row.mentor_id, stringifyPostgresJson({ read: true, write: true, admin: true }), stringifyPostgresJson({ read: true, write: true, admin: false })]
    );
    await client.query(
      `INSERT INTO live_workspaces (collaboration_id, created_by, status, expires_at) VALUES ($1,$2,'active',$3)`,
      [workspaceId, row.learner_id, window.expiresAt.toISOString()]
    );
    // Instructor = observe, chat, request control, and approve the learner's own
    // terminal lease. It cannot attach the learner's resources or end the room.
    await client.query(
      `INSERT INTO live_workspace_participants (collaboration_id, user_id, role, status, assigned_by)
       VALUES ($1,$2,'owner','active',$2), ($1,$3,'instructor','active',$2)`,
      [workspaceId, row.learner_id, row.mentor_id]
    );
    await client.query(`UPDATE mentorship_sessions SET collaboration_id=$2, updated_at=NOW() WHERE id=$1`, [sessionId, workspaceId]);
    await client.query(`INSERT INTO mentorship_attendance(session_id,owner_id) VALUES($1,$2) ON CONFLICT DO NOTHING`,[sessionId,userId]);
    await recordSessionEvent(client, { sessionId, actorId: userId, type: 'room_opened', detail: workspaceId });
    return { workspaceId, created: true, role, counterpart: role === 'learner' ? row.mentor_id : row.learner_id };
  });
  if (result.created) {
    await notify(result.counterpart, sessionId, 'room_open', 'Your Rescue Room is open', 'Join the live workspace for your mentorship session.');
  }
  return { workspaceId: result.workspaceId, href: `/live?workspace=${result.workspaceId}` };
}

/* ------------------------------------------------------------------ reads */

const SESSION_SELECT = `SELECT session.*, counterpart.id AS counterpart_id, counterpart.display_name AS counterpart_name,
         counterpart.avatar_url AS counterpart_avatar
    FROM mentorship_sessions session
    LEFT JOIN users counterpart
      ON counterpart.id = CASE WHEN session.learner_id=$1 THEN session.mentor_id ELSE session.learner_id END`;

const ACTIONS: SessionAction[] = ['confirm', 'decline', 'cancel', 'reschedule', 'complete', 'no_show', 'summary'];

function mapSession(row: Record<string, any>, viewerId: string): MentorshipSessionView {
  const role: SessionRole = row.learner_id === viewerId ? 'learner' : 'mentor';
  const snap = snapshot(row as SessionRow);
  const window = roomWindow(snap);
  return {
    id: row.id,
    role,
    status: row.status,
    kind: row.kind,
    durationMinutes: Number(row.duration_minutes),
    specializationId: row.specialization_id,
    startsAt: iso(row.starts_at),
    endsAt: iso(row.ends_at),
    learnerTimezone: row.learner_timezone,
    topic: row.topic,
    learnerGoal: row.learner_goal,
    attemptedSummary: row.attempted_summary || '',
    sharedContext: row.shared_context && typeof row.shared_context === 'object' ? row.shared_context : {},
    mentorNote: row.mentor_note || null,
    cancellationReason: row.cancellation_reason || null,
    lateCancellation: Boolean(row.late_cancellation),
    mentorSummary: row.mentor_summary || null,
    counterpart: {
      id: row.counterpart_id || null,
      displayName: (row.counterpart_name as string | null)?.trim() || (row.counterpart_id ? 'OXSIG member' : 'Account closed'),
      avatarUrl: row.counterpart_avatar || null,
    },
    room: { open: window.open, opensAt: window.opensAt.toISOString(), expiresAt: window.expiresAt.toISOString(), workspaceId: window.open ? row.collaboration_id || null : null },
    allowedActions: ACTIONS.filter((action) => !sessionActionError(action, role, snap)),
    rescheduledFrom: row.rescheduled_from || null,
    offeringId: row.offering_id || null,
    createdAt: iso(row.created_at),
  };
}

export async function getMentorshipSession(userId: string, sessionId: string) {
  const result = await getPool().query(`${SESSION_SELECT} WHERE session.id=$2 AND (session.learner_id=$1 OR session.mentor_id=$1) LIMIT 1`, [userId, sessionId]);
  if (!result.rows[0]) throw new MentorshipError('Session not found.', 'SESSION_NOT_FOUND', 404);
  return mapSession(result.rows[0], userId);
}

export async function listMentorshipSessions(userId: string) {
  try {
    await transaction(async (client) => {
      await lockUsers(client, [userId]);
      await sweepStaleSessions(client, [userId]);
    });
  } catch (error) {
    // Housekeeping only: reads stay correct because every write path re-checks.
    console.warn('Mentorship session sweep skipped:', error);
  }
  const result = await getPool().query(
    `${SESSION_SELECT}
      WHERE (session.learner_id=$1 OR session.mentor_id=$1)
        AND session.starts_at > NOW() - make_interval(days => $2::int)
      ORDER BY session.starts_at DESC
      LIMIT 200`,
    [userId, BOOKING_HORIZON_DAYS * 6]
  );
  return result.rows.map((row) => mapSession(row, userId));
}

export function isActiveSessionStatus(status: SessionStatus) {
  return ACTIVE_SESSION_STATUSES.includes(status);
}
