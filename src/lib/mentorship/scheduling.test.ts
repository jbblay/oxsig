import { describe, expect, it } from 'vitest';
import {
  availabilityRulesError,
  bookingInputSchema,
  bookingWindowError,
  generateOpenSlots,
  isLateCancellation,
  offeringInputSchema,
  overlaps,
  roomWindow,
  sessionActionError,
  slotFitsAvailability,
  zonedParts,
} from './scheduling';

const monday9to12 = [{ weekday: 1, startMinute: 9 * 60, endMinute: 12 * 60 }];

describe('time zones', () => {
  it('reads wall-clock weekday and minute in the mentor time zone', () => {
    // 2026-10-19 is a Monday. 08:00 UTC = 09:00 in London (BST ends 25 Oct).
    expect(zonedParts(new Date('2026-10-19T08:00:00Z'), 'Europe/London')).toMatchObject({ weekday: 1, minute: 540 });
    expect(zonedParts(new Date('2026-10-19T08:00:00Z'), 'America/New_York')).toMatchObject({ weekday: 1, minute: 240 });
    expect(zonedParts(new Date('2026-10-19T00:30:00Z'), 'UTC')).toMatchObject({ minute: 30 });
  });

  it('fits slots fully inside a rule only', () => {
    expect(slotFitsAvailability(new Date('2026-10-19T08:00:00Z'), 60, monday9to12, 'Europe/London')).toBe(true);
    expect(slotFitsAvailability(new Date('2026-10-19T10:30:00Z'), 60, monday9to12, 'Europe/London')).toBe(false);
    expect(slotFitsAvailability(new Date('2026-10-19T07:45:00Z'), 30, monday9to12, 'Europe/London')).toBe(false);
    expect(slotFitsAvailability(new Date('2026-10-20T08:00:00Z'), 30, monday9to12, 'Europe/London')).toBe(false);
  });

  it('rejects slots that cross a DST change instead of guessing', () => {
    // Europe/London falls back at 01:00 UTC on 2026-10-25 (a Sunday).
    const rules = [{ weekday: 0, startMinute: 0, endMinute: 1440 }];
    expect(slotFitsAvailability(new Date('2026-10-25T00:30:00Z'), 60, rules, 'Europe/London')).toBe(false);
    expect(slotFitsAvailability(new Date('2026-10-25T03:00:00Z'), 60, rules, 'Europe/London')).toBe(true);
  });
});

describe('slots and overlap', () => {
  const now = new Date('2026-10-18T12:00:00Z');

  it('generates 15-minute slots inside availability and excludes busy time', () => {
    const slots = generateOpenSlots({ rules: monday9to12, timeZone: 'UTC', durationMinutes: 30, busy: [], now, days: 2 });
    expect(slots[0].toISOString()).toBe('2026-10-19T09:00:00.000Z');
    expect(slots.at(-1)!.toISOString()).toBe('2026-10-19T11:30:00.000Z');
    expect(slots).toHaveLength(11);

    const busy = [{ start: new Date('2026-10-19T10:00:00Z'), end: new Date('2026-10-19T10:30:00Z') }];
    const remaining = generateOpenSlots({ rules: monday9to12, timeZone: 'UTC', durationMinutes: 30, busy, now, days: 2 }).map((slot) => slot.toISOString());
    expect(remaining).not.toContain('2026-10-19T09:45:00.000Z');
    expect(remaining).not.toContain('2026-10-19T10:15:00.000Z');
    expect(remaining).toContain('2026-10-19T09:30:00.000Z');
    expect(remaining).toContain('2026-10-19T10:30:00.000Z');
  });

  it('respects the minimum lead time', () => {
    const soon = new Date('2026-10-19T08:50:00Z');
    const slots = generateOpenSlots({ rules: monday9to12, timeZone: 'UTC', durationMinutes: 15, busy: [], now: soon, days: 1 });
    expect(slots[0].toISOString()).toBe('2026-10-19T09:30:00.000Z');
  });

  it('treats back-to-back sessions as non-overlapping', () => {
    const a = { start: new Date('2026-10-19T09:00:00Z'), end: new Date('2026-10-19T09:30:00Z') };
    expect(overlaps(a, { start: a.end, end: new Date('2026-10-19T10:00:00Z') })).toBe(false);
    expect(overlaps(a, { start: new Date('2026-10-19T09:15:00Z'), end: new Date('2026-10-19T09:45:00Z') })).toBe(true);
  });

  it('validates booking windows', () => {
    expect(bookingWindowError(new Date('2026-10-18T12:15:00Z'), now)).toMatch(/30 minutes/);
    expect(bookingWindowError(new Date('2026-10-18T13:07:00Z'), now)).toMatch(/15-minute/);
    expect(bookingWindowError(new Date('2026-12-30T12:00:00Z'), now)).toMatch(/30 days/);
    expect(bookingWindowError(new Date('2026-10-19T09:00:00Z'), now)).toBeNull();
  });

  it('rejects overlapping availability windows', () => {
    expect(availabilityRulesError([...monday9to12, { weekday: 1, startMinute: 11 * 60, endMinute: 13 * 60 }])).toMatch(/overlap/);
    expect(availabilityRulesError([...monday9to12, { weekday: 1, startMinute: 12 * 60, endMinute: 13 * 60 }])).toBeNull();
  });
});

describe('session lifecycle', () => {
  const startsAt = new Date('2026-10-19T09:00:00Z');
  const endsAt = new Date('2026-10-19T09:30:00Z');
  const before = new Date('2026-10-19T08:00:00Z');
  const during = new Date('2026-10-19T09:15:00Z');
  const requested = { status: 'requested' as const, startsAt, endsAt };
  const confirmed = { status: 'confirmed' as const, startsAt, endsAt };

  it('only mentors confirm, decline, complete, mark no-shows and write summaries', () => {
    expect(sessionActionError('confirm', 'learner', requested, before)).not.toBeNull();
    expect(sessionActionError('confirm', 'mentor', requested, before)).toBeNull();
    expect(sessionActionError('complete', 'learner', confirmed, during)).not.toBeNull();
    expect(sessionActionError('no_show', 'learner', confirmed, during)).not.toBeNull();
    expect(sessionActionError('summary', 'learner', { ...confirmed, status: 'completed' }, during)).not.toBeNull();
  });

  it('only learners reschedule, and only before the start', () => {
    expect(sessionActionError('reschedule', 'mentor', confirmed, before)).not.toBeNull();
    expect(sessionActionError('reschedule', 'learner', confirmed, before)).toBeNull();
    expect(sessionActionError('reschedule', 'learner', confirmed, during)).not.toBeNull();
  });

  it('cannot complete before start, or mark no-show before the grace period', () => {
    expect(sessionActionError('complete', 'mentor', confirmed, before)).not.toBeNull();
    expect(sessionActionError('complete', 'mentor', confirmed, during)).toBeNull();
    expect(sessionActionError('no_show', 'mentor', confirmed, new Date('2026-10-19T09:05:00Z'))).not.toBeNull();
    expect(sessionActionError('no_show', 'mentor', confirmed, new Date('2026-10-19T09:11:00Z'))).toBeNull();
  });

  it('does not let anyone act on closed sessions', () => {
    for (const status of ['declined', 'cancelled', 'expired', 'no_show'] as const) {
      for (const action of ['confirm', 'cancel', 'reschedule', 'complete'] as const) {
        expect(sessionActionError(action, 'mentor', { status, startsAt, endsAt }, before)).not.toBeNull();
        expect(sessionActionError(action, 'learner', { status, startsAt, endsAt }, before)).not.toBeNull();
      }
    }
  });

  it('opens the Rescue Room only for confirmed sessions, 10 minutes before until the end', () => {
    expect(roomWindow(confirmed, new Date('2026-10-19T08:49:00Z')).open).toBe(false);
    expect(roomWindow(confirmed, new Date('2026-10-19T08:51:00Z')).open).toBe(true);
    expect(roomWindow(confirmed, endsAt).open).toBe(false);
    expect(roomWindow(requested, during).open).toBe(false);
    expect(roomWindow(confirmed).expiresAt.toISOString()).toBe('2026-10-19T09:40:00.000Z');
  });

  it('flags cancellations inside two hours as late', () => {
    expect(isLateCancellation(startsAt, new Date('2026-10-19T07:30:00Z'))).toBe(true);
    expect(isLateCancellation(startsAt, new Date('2026-10-19T06:30:00Z'))).toBe(false);
  });
});

describe('input validation', () => {
  it('has no price field: offerings cannot be paid', () => {
    const offering = { kind: 'quick_help', title: 'Quick help', durationMinutes: 15, specializationIds: ['linux-systems'] };
    expect(offeringInputSchema.safeParse(offering).success).toBe(true);
    expect(offeringInputSchema.safeParse({ ...offering, priceCents: 500 }).success).toBe(false);
    expect(offeringInputSchema.safeParse({ ...offering, durationMinutes: 90 }).success).toBe(false);
  });

  it('never accepts a client-supplied learner or shared context body', () => {
    const booking = {
      mentorId: '11111111-1111-4111-8111-111111111111',
      offeringId: '22222222-2222-4222-8222-222222222222',
      specializationId: 'linux-systems',
      startsAt: '2026-10-19T09:00:00.000Z',
      learnerTimezone: 'UTC',
      topic: 'Processes',
      learnerGoal: 'Understand fork and exec',
    };
    expect(bookingInputSchema.safeParse(booking).success).toBe(true);
    expect(bookingInputSchema.safeParse({ ...booking, learnerId: 'someone-else' }).success).toBe(false);
    expect(bookingInputSchema.safeParse({ ...booking, sharedContext: { terminal: 'secret' } }).success).toBe(false);
  });
});
