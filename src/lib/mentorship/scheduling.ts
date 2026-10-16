import { z } from 'zod';
import { MENTOR_SPECIALIZATION_IDS } from './specializations';

/*
 * Pure scheduling policy for free mentorship: time-zone arithmetic without
 * third-party libraries, slot generation, booking windows and the session
 * state machine. All instants are UTC Date objects; availability rules are
 * wall-clock minutes in the mentor's IANA time zone.
 */

export const SLOT_STEP_MINUTES = 15;
export const BOOKING_MIN_LEAD_MINUTES = 30;
export const BOOKING_HORIZON_DAYS = 30;
export const AVAILABILITY_PREVIEW_DAYS = 14;
export const MAX_ACTIVE_LEARNER_SESSIONS = 3;
export const LATE_CANCELLATION_MINUTES = 120;
export const ROOM_OPENS_BEFORE_MINUTES = 10;
export const ROOM_GRACE_AFTER_MINUTES = 10;
export const NO_SHOW_AFTER_MINUTES = 10;
export const SUMMARY_EDIT_WINDOW_DAYS = 7;
export const MAX_AVAILABILITY_RULES = 21;

export type SessionKind = 'quick_help' | 'guided_coaching' | 'deep_session' | 'project_review';
export type SessionStatus = 'requested' | 'confirmed' | 'declined' | 'cancelled' | 'expired' | 'completed' | 'no_show';
export type SessionRole = 'learner' | 'mentor';

export const SESSION_KIND_LABELS: Record<SessionKind, string> = {
  quick_help: 'Quick troubleshooting help',
  guided_coaching: 'Guided technical coaching',
  deep_session: 'Deep technical session',
  project_review: 'Project review',
};

export const SESSION_KIND_DEFAULT_MINUTES: Record<SessionKind, 15 | 30 | 45 | 60> = {
  quick_help: 15,
  guided_coaching: 30,
  deep_session: 60,
  project_review: 30,
};

export const ACTIVE_SESSION_STATUSES: readonly SessionStatus[] = ['requested', 'confirmed'];

export type AvailabilityRule = { weekday: number; startMinute: number; endMinute: number };

/* ------------------------------------------------------------ time zones */

const formatters = new Map<string, Intl.DateTimeFormat>();
const WEEKDAYS: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };

function formatterFor(timeZone: string) {
  let formatter = formatters.get(timeZone);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat('en-US', {
      timeZone,
      hourCycle: 'h23',
      weekday: 'short',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
    formatters.set(timeZone, formatter);
  }
  return formatter;
}

/** Wall-clock parts of a UTC instant in a time zone. */
export function zonedParts(instant: Date, timeZone: string) {
  const parts = Object.fromEntries(formatterFor(timeZone).formatToParts(instant).map((part) => [part.type, part.value]));
  const hour = Number(parts.hour) % 24;
  return {
    date: `${parts.year}-${parts.month}-${parts.day}`,
    weekday: WEEKDAYS[parts.weekday as string] ?? -1,
    minute: hour * 60 + Number(parts.minute),
  };
}

/**
 * True when [start, start+duration) lies inside one availability rule in the
 * mentor's time zone on a single local day. Slots that cross a DST transition
 * are rejected rather than guessed.
 */
export function slotFitsAvailability(start: Date, durationMinutes: number, rules: readonly AvailabilityRule[], timeZone: string) {
  const first = zonedParts(start, timeZone);
  const last = zonedParts(new Date(start.getTime() + (durationMinutes - 1) * 60_000), timeZone);
  if (first.date !== last.date || last.minute !== first.minute + durationMinutes - 1) return false;
  return rules.some(
    (rule) => rule.weekday === first.weekday && rule.startMinute <= first.minute && first.minute + durationMinutes <= rule.endMinute
  );
}

export type Interval = { start: Date; end: Date };

export function overlaps(a: Interval, b: Interval) {
  return a.start < b.end && b.start < a.end;
}

export function isAlignedToSlotStep(instant: Date) {
  return instant.getTime() % (SLOT_STEP_MINUTES * 60_000) === 0;
}

export function bookingWindowError(start: Date, now = new Date()): string | null {
  if (Number.isNaN(start.getTime())) return 'Choose a valid start time.';
  if (!isAlignedToSlotStep(start)) return `Sessions start on ${SLOT_STEP_MINUTES}-minute boundaries.`;
  if (start.getTime() < now.getTime() + BOOKING_MIN_LEAD_MINUTES * 60_000) {
    return `Book at least ${BOOKING_MIN_LEAD_MINUTES} minutes ahead.`;
  }
  if (start.getTime() > now.getTime() + BOOKING_HORIZON_DAYS * 86_400_000) {
    return `Sessions can be booked up to ${BOOKING_HORIZON_DAYS} days ahead.`;
  }
  return null;
}

/** Open slots for one offering, excluding busy intervals. */
export function generateOpenSlots(input: {
  rules: readonly AvailabilityRule[];
  timeZone: string;
  durationMinutes: number;
  busy: readonly Interval[];
  now?: Date;
  days?: number;
  limit?: number;
}): Date[] {
  const now = input.now ?? new Date();
  const step = SLOT_STEP_MINUTES * 60_000;
  const first = Math.ceil((now.getTime() + BOOKING_MIN_LEAD_MINUTES * 60_000) / step) * step;
  const last = now.getTime() + Math.min(input.days ?? AVAILABILITY_PREVIEW_DAYS, BOOKING_HORIZON_DAYS) * 86_400_000;
  const limit = input.limit ?? 200;
  const slots: Date[] = [];
  if (!input.rules.length) return slots;
  for (let time = first; time <= last && slots.length < limit; time += step) {
    const start = new Date(time);
    if (!slotFitsAvailability(start, input.durationMinutes, input.rules, input.timeZone)) continue;
    const candidate = { start, end: new Date(time + input.durationMinutes * 60_000) };
    if (input.busy.some((interval) => overlaps(candidate, interval))) continue;
    slots.push(start);
  }
  return slots;
}

/** Rules must be well-formed and non-overlapping within a weekday. */
export function availabilityRulesError(rules: readonly AvailabilityRule[]): string | null {
  if (rules.length > MAX_AVAILABILITY_RULES) return `Use at most ${MAX_AVAILABILITY_RULES} availability windows.`;
  const sorted = [...rules].sort((a, b) => a.weekday - b.weekday || a.startMinute - b.startMinute);
  for (let index = 0; index < sorted.length; index += 1) {
    const rule = sorted[index];
    if (rule.endMinute <= rule.startMinute) return 'Each availability window must end after it starts.';
    const next = sorted[index + 1];
    if (next && next.weekday === rule.weekday && next.startMinute < rule.endMinute) {
      return 'Availability windows on the same day must not overlap.';
    }
  }
  return null;
}

/* ------------------------------------------------------- session lifecycle */

export type SessionAction = 'confirm' | 'decline' | 'cancel' | 'reschedule' | 'complete' | 'no_show' | 'summary';

type SessionSnapshot = { status: SessionStatus; startsAt: Date; endsAt: Date; closedAt?: Date | null };

/** Returns null when allowed, otherwise a human-readable refusal. */
export function sessionActionError(action: SessionAction, role: SessionRole, session: SessionSnapshot, now = new Date()): string | null {
  const started = now >= session.startsAt;
  const ended = now >= session.endsAt;
  switch (action) {
    case 'confirm':
    case 'decline':
      if (role !== 'mentor') return 'Only the mentor can respond to a request.';
      if (session.status !== 'requested') return 'This request has already been answered.';
      if (started) return 'This request has expired.';
      return null;
    case 'cancel':
      if (!ACTIVE_SESSION_STATUSES.includes(session.status)) return 'Only an upcoming session can be cancelled.';
      if (ended) return 'This session has already ended.';
      return null;
    case 'reschedule':
      if (role !== 'learner') return 'Only the learner can reschedule; mentors can cancel with a note instead.';
      if (!ACTIVE_SESSION_STATUSES.includes(session.status)) return 'Only an upcoming session can be rescheduled.';
      if (started) return 'This session has already started.';
      return null;
    case 'complete':
      if (role !== 'mentor') return 'Only the mentor can mark a session complete.';
      if (session.status !== 'confirmed') return 'Only a confirmed session can be completed.';
      if (!started) return 'A session cannot be completed before it starts.';
      return null;
    case 'no_show':
      if (role !== 'mentor') return 'Only the mentor can record a no-show.';
      if (session.status !== 'confirmed') return 'Only a confirmed session can be marked as a no-show.';
      if (now.getTime() < session.startsAt.getTime() + NO_SHOW_AFTER_MINUTES * 60_000) {
        return `Wait at least ${NO_SHOW_AFTER_MINUTES} minutes after the start time.`;
      }
      return null;
    case 'summary':
      if (role !== 'mentor') return 'Only the mentor writes the session summary.';
      if (session.status !== 'completed') return 'Summaries are written after a session is completed.';
      if (session.closedAt && now.getTime() > session.closedAt.getTime() + SUMMARY_EDIT_WINDOW_DAYS * 86_400_000) {
        return `Summaries can be edited for ${SUMMARY_EDIT_WINDOW_DAYS} days.`;
      }
      return null;
  }
}

/** Whether either participant may enter the Rescue Room right now. */
export function roomWindow(session: { status: SessionStatus; startsAt: Date; endsAt: Date }, now = new Date()) {
  const opensAt = new Date(session.startsAt.getTime() - ROOM_OPENS_BEFORE_MINUTES * 60_000);
  const expiresAt = new Date(session.endsAt.getTime() + ROOM_GRACE_AFTER_MINUTES * 60_000);
  return {
    opensAt,
    expiresAt,
    open: session.status === 'confirmed' && now >= opensAt && now < session.endsAt,
  };
}

export function isLateCancellation(startsAt: Date, now = new Date()) {
  return startsAt.getTime() - now.getTime() < LATE_CANCELLATION_MINUTES * 60_000;
}

/* ------------------------------------------------------------ validation */

const kind = z.enum(['quick_help', 'guided_coaching', 'deep_session', 'project_review']);

export const offeringInputSchema = z
  .object({
    kind,
    title: z.string().trim().min(3).max(80),
    description: z.string().trim().max(500).default(''),
    durationMinutes: z.union([z.literal(15), z.literal(30), z.literal(45), z.literal(60)]),
    specializationIds: z.array(z.enum(MENTOR_SPECIALIZATION_IDS)).min(1).max(8)
      .refine((items) => new Set(items).size === items.length, 'Specializations must be unique.'),
  })
  .strict();

export type OfferingInput = z.infer<typeof offeringInputSchema>;

export const availabilityInputSchema = z
  .object({
    rules: z.array(
      z.object({
        weekday: z.number().int().min(0).max(6),
        startMinute: z.number().int().min(0).max(1425).refine((value) => value % SLOT_STEP_MINUTES === 0, 'Use 15-minute steps.'),
        endMinute: z.number().int().min(15).max(1440).refine((value) => value % SLOT_STEP_MINUTES === 0, 'Use 15-minute steps.'),
      }).strict()
    ).max(MAX_AVAILABILITY_RULES),
  })
  .strict()
  .superRefine((value, context) => {
    const error = availabilityRulesError(value.rules);
    if (error) context.addIssue({ code: z.ZodIssueCode.custom, message: error, path: ['rules'] });
  });

export const bookingInputSchema = z
  .object({
    mentorId: z.string().uuid(),
    offeringId: z.string().uuid(),
    specializationId: z.enum(MENTOR_SPECIALIZATION_IDS),
    startsAt: z.string().datetime({ offset: true }),
    learnerTimezone: z.string().min(1).max(64),
    topic: z.string().trim().min(3).max(160),
    learnerGoal: z.string().trim().min(10, 'Describe what you want to achieve (10+ characters).').max(2000),
    attemptedSummary: z.string().trim().max(2000).default(''),
    shareAcademyContext: z.boolean().default(false),
  })
  .strict();

export type BookingInput = z.infer<typeof bookingInputSchema>;
