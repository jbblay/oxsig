import 'server-only';

import type { Pool, PoolClient } from 'pg';
import { getPool, transaction } from '@/lib/db/pool';
import { stringifyPostgresJson } from '@/lib/db/postgres-safe';
import { createWorkspaceNotification } from '@/lib/notifications/server';
import {
  MENTOR_CODE_OF_CONDUCT_VERSION,
  deriveMentorProgressionStage,
  evaluateMentorEligibility,
  ineligibleSpecializations,
  mentorReapplyAvailableAt,
  type DemonstratedCapabilities,
  type VerifiedMissionEvidence,
  type MentorApplicationInput,
  type MentorApplicationStatus,
  type MentorEligibility,
  type MentorProfileStatus,
  type MentorProfileUpdate,
  type MentorTier,
  type MentorTrack,
} from './policy';
import { getMentorSpecialization, mentorSpecializationLabel } from './specializations';
import type {
  MentorApplicationSummary,
  MentorCenterState,
  MentorOfferingView,
  MentorOwnProfile,
  MentorQualificationView,
  PublicMentorProfile,
  VerifiedCredential,
} from './types';

export type Queryable = Pick<Pool | PoolClient, 'query'>;

export class MentorshipError extends Error {
  constructor(message: string, readonly code: string, readonly status = 409, readonly details?: Record<string, unknown>) {
    super(message);
    this.name = 'MentorshipError';
  }
}

const iso = (value: unknown) => (value ? new Date(value as string).toISOString() : null);

/* --------------------------------------------------------------- evidence */

/**
 * Capabilities the user has demonstrated, keyed by curated path id. Uses the
 * same rule as the proved-skills transcript and rewards: an assessment, or a
 * practice AND a reflection within the same enrollment. XP is never consulted.
 */
export async function loadDemonstratedCapabilities(queryable: Queryable, userId: string): Promise<DemonstratedCapabilities> {
  try {
    const result = await queryable.query(
      `WITH capability_proof AS (
         SELECT evidence.enrollment_id,
                evidence.capability_id,
                BOOL_OR(evidence.source_type='assessment' AND evidence.result='demonstrated') AS assessment,
                BOOL_OR(evidence.source_type='academy-practice' AND evidence.result='demonstrated') AS practice,
                BOOL_OR(evidence.source_type='academy-reflection' AND evidence.result='demonstrated') AS reflection
           FROM learning_capability_evidence evidence
          WHERE evidence.owner_id=$1
          GROUP BY evidence.enrollment_id, evidence.capability_id
       )
       SELECT DISTINCT enrollment.path_id, proof.capability_id
         FROM capability_proof proof
         JOIN learning_path_enrollments enrollment ON enrollment.id=proof.enrollment_id AND enrollment.owner_id=$1
        WHERE proof.assessment OR (proof.practice AND proof.reflection)`,
      [userId]
    );
    const map = new Map<string, Set<string>>();
    for (const row of result.rows as Array<{ path_id: string; capability_id: string }>) {
      if (!map.has(row.path_id)) map.set(row.path_id, new Set());
      map.get(row.path_id)!.add(row.capability_id);
    }
    return map;
  } catch (error) {
    if ((error as { code?: string } | null)?.code === '42P01') return new Map();
    throw error;
  }
}

/**
 * Server-observed mission proofs, not UI completion, XP, hints or unverified
 * attempts. Engineering proof must be a verified, individual practice run.
 * Repeated attempts contribute at most one ID.
 */
export async function loadVerifiedMentorMissionEvidence(
  queryable: Queryable,
  userId: string
): Promise<VerifiedMissionEvidence> {
  try {
    const [docker, engineering] = await Promise.all([
      queryable.query(
        `SELECT DISTINCT mission_id FROM academy_mission_progress
          WHERE owner_id=$1 AND verified_at IS NOT NULL
            AND mission_id = ANY($2::text[])`,
        [userId, ['deploy', 'repair', 'persist']]
      ),
      queryable.query(
        `SELECT DISTINCT template_id FROM academy_mission_runs
          WHERE owner_id=$1 AND status='verified' AND verified_at IS NOT NULL
            AND mode='practice' AND template_version=1
            AND template_id = ANY($2::text[])`,
        [userId, ['docker-incident', 'docker-durability']]
      ),
    ]);
    return new Set([
      ...docker.rows.map((r) => `mission:${r.mission_id}`),
      ...engineering.rows.map((r) => `engineering:${r.template_id}`),
    ]);
  } catch (error) {
    // Old installations without mission tables are not eligible; never
    // fabricate positive evidence or hide other database failures.
    if ((error as { code?: string } | null)?.code === '42P01') return new Set();
    throw error;
  }
}

export async function getMentorEligibility(userId: string, queryable: Queryable = getPool()): Promise<MentorEligibility> {
  const [demonstrated, verifiedMissions] = await Promise.all([
    loadDemonstratedCapabilities(queryable, userId),
    loadVerifiedMentorMissionEvidence(queryable, userId),
  ]);
  return evaluateMentorEligibility(demonstrated, verifiedMissions);
}

/* ---------------------------------------------------------------- mapping */

type ApplicationRow = Record<string, any>;

export function mapApplication(row: ApplicationRow): MentorApplicationSummary {
  return {
    id: row.id,
    track: row.track,
    status: row.status,
    headline: row.headline,
    bio: row.bio,
    specializations: row.specializations || [],
    yearsExperience: Number(row.years_experience) || 0,
    teachingBackground: row.teaching_background || '',
    motivation: row.motivation,
    credentials: Array.isArray(row.credentials) ? row.credentials : [],
    profileUrl: row.profile_url || null,
    timezone: row.timezone,
    decisionNote: row.decision_note || null,
    decidedAt: iso(row.decided_at),
    submittedAt: iso(row.submitted_at)!,
    updatedAt: iso(row.updated_at)!,
  };
}

// Never includes reviewer_note: applicant-facing reads use this column list.
export const APPLICANT_APPLICATION_COLUMNS = `id, track, status, headline, bio, specializations, years_experience,
  teaching_background, motivation, credentials, profile_url, timezone, decision_note, decided_at,
  submitted_at, updated_at`;

export function mapQualification(row: Record<string, any>): MentorQualificationView {
  return {
    id: row.id,
    specializationId: row.specialization_id,
    basis: row.basis,
    grantedAt: iso(row.granted_at)!,
  };
}

function verifiedCredentials(value: unknown): VerifiedCredential[] {
  return Array.isArray(value) ? (value as VerifiedCredential[]) : [];
}

export async function loadActiveQualifications(queryable: Queryable, mentorIds: string[]) {
  const byMentor = new Map<string, MentorQualificationView[]>();
  if (!mentorIds.length) return byMentor;
  const result = await queryable.query(
    `SELECT id, mentor_id, specialization_id, basis, granted_at
       FROM mentor_qualifications
      WHERE mentor_id = ANY($1::uuid[]) AND status='active'
      ORDER BY granted_at ASC`,
    [mentorIds]
  );
  for (const row of result.rows) {
    if (!byMentor.has(row.mentor_id)) byMentor.set(row.mentor_id, []);
    byMentor.get(row.mentor_id)!.push(mapQualification(row));
  }
  return byMentor;
}

/* ------------------------------------------------------------ mentor center */

type ApplyGate = { canApply: boolean; reason: string | null; code: string | null; reapplyAvailableAt: Date | null };

async function evaluateApplyGate(
  queryable: Queryable,
  userId: string,
  profileStatus: MentorProfileStatus | null,
  profileStatusChangedAt: Date | null
): Promise<ApplyGate> {
  if (profileStatus === 'active' || profileStatus === 'paused') {
    return { canApply: false, code: 'ALREADY_MENTOR', reason: 'You are already an approved mentor.', reapplyAvailableAt: null };
  }
  if (profileStatus === 'suspended') {
    return { canApply: false, code: 'MENTOR_SUSPENDED', reason: 'Your mentor profile is suspended. Contact OXSIG support.', reapplyAvailableAt: null };
  }
  const open = await queryable.query(
    `SELECT id FROM mentor_applications
      WHERE applicant_id=$1 AND status IN ('submitted','under_review','changes_requested') LIMIT 1`,
    [userId]
  );
  if (open.rows[0]) {
    return { canApply: false, code: 'APPLICATION_OPEN', reason: 'You already have an application in progress.', reapplyAvailableAt: null };
  }
  const rejected = await queryable.query(
    `SELECT MAX(decided_at) AS last_rejected_at FROM mentor_applications WHERE applicant_id=$1 AND status='rejected'`,
    [userId]
  );
  const lastNegative = [rejected.rows[0]?.last_rejected_at, profileStatus === 'revoked' ? profileStatusChangedAt : null]
    .filter(Boolean)
    .map((value) => new Date(value as string))
    .sort((a, b) => b.getTime() - a.getTime())[0] ?? null;
  const reapplyAt = mentorReapplyAvailableAt(lastNegative);
  if (reapplyAt) {
    return { canApply: false, code: 'REAPPLY_COOLDOWN', reason: `You can apply again after ${reapplyAt.toISOString().slice(0, 10)}.`, reapplyAvailableAt: reapplyAt };
  }
  return { canApply: true, code: null, reason: null, reapplyAvailableAt: null };
}

async function loadOwnProfile(queryable: Queryable, userId: string) {
  const result = await queryable.query(
    `SELECT user_id, track, tier, status, status_reason, status_changed_at, headline, bio, timezone,
            availability_note, is_listed, verified_credentials, approved_at
       FROM mentor_profiles WHERE user_id=$1 LIMIT 1`,
    [userId]
  );
  return result.rows[0] as Record<string, any> | undefined;
}

export async function getMentorCenterState(userId: string): Promise<MentorCenterState> {
  const pool = getPool();
  const [eligibility, applications, profileRow] = await Promise.all([
    getMentorEligibility(userId, pool),
    pool.query(
      `SELECT ${APPLICANT_APPLICATION_COLUMNS} FROM mentor_applications
        WHERE applicant_id=$1 ORDER BY created_at DESC LIMIT 10`,
      [userId]
    ),
    loadOwnProfile(pool, userId),
  ]);
  const mapped = applications.rows.map(mapApplication);
  const openApplication = mapped.find((item) => ['submitted', 'under_review', 'changes_requested'].includes(item.status)) ?? null;

  let profile: MentorOwnProfile | null = null;
  if (profileRow) {
    const qualifications = await loadActiveQualifications(pool, [userId]);
    profile = {
      track: profileRow.track,
      tier: profileRow.tier,
      status: profileRow.status,
      statusReason: profileRow.status_reason || null,
      headline: profileRow.headline,
      bio: profileRow.bio,
      timezone: profileRow.timezone,
      availabilityNote: profileRow.availability_note || '',
      isListed: Boolean(profileRow.is_listed),
      verifiedCredentials: verifiedCredentials(profileRow.verified_credentials),
      approvedAt: iso(profileRow.approved_at)!,
      qualifications: qualifications.get(userId) ?? [],
    };
  }

  const gate = await evaluateApplyGate(
    pool,
    userId,
    (profileRow?.status as MentorProfileStatus) ?? null,
    profileRow?.status_changed_at ? new Date(profileRow.status_changed_at) : null
  );

  return {
    stage: deriveMentorProgressionStage({
      eligibility,
      hasOpenApplication: Boolean(openApplication),
      profile: profileRow ? { tier: profileRow.tier as MentorTier, status: profileRow.status as MentorProfileStatus } : null,
    }),
    eligibility,
    openApplication,
    applications: mapped,
    profile,
    canApply: gate.canApply,
    applyBlockedReason: gate.reason,
    reapplyAvailableAt: gate.reapplyAvailableAt?.toISOString() ?? null,
  };
}

/* ------------------------------------------------------------ applications */

function assertSpecializationsAllowed(track: MentorTrack, specializations: string[], eligibility: MentorEligibility) {
  if (track === 'academy' && !eligibility.advancedPractitioner) {
    throw new MentorshipError(
      'Academy-track applications require verified capability evidence in at least one specialization.',
      'NOT_ELIGIBLE',
      403
    );
  }
  const blocked = ineligibleSpecializations(track, specializations, eligibility);
  if (blocked.length) {
    throw new MentorshipError(
      `Not enough verified Academy evidence for: ${blocked.map(mentorSpecializationLabel).join(', ')}.`,
      'SPECIALIZATION_NOT_ELIGIBLE',
      403,
      { specializations: blocked }
    );
  }
}

function eligibilitySnapshot(track: MentorTrack, specializations: string[], eligibility: MentorEligibility) {
  return {
    capturedAt: new Date().toISOString(),
    track,
    advancedPractitioner: eligibility.advancedPractitioner,
    specializations: eligibility.specializations.filter((item) => specializations.includes(item.specializationId)),
  };
}

async function recordApplicationEvent(
  queryable: Queryable,
  event: { applicationId: string; applicantId: string; actorId: string | null; actorKind: 'applicant' | 'admin' | 'system'; from: MentorApplicationStatus | null; to: MentorApplicationStatus; note?: string | null }
) {
  await queryable.query(
    `INSERT INTO mentor_application_events (application_id, applicant_id, actor_id, actor_kind, from_status, to_status, note)
     VALUES ($1,$2,$3,$4,$5,$6,$7)`,
    [event.applicationId, event.applicantId, event.actorId, event.actorKind, event.from, event.to, event.note?.slice(0, 1000) ?? null]
  );
}

async function notifyReviewers(applicationId: string, track: MentorTrack) {
  try {
    const admins = await getPool().query(
      `SELECT id FROM users WHERE role='admin' AND is_active=true AND suspended_at IS NULL ORDER BY created_at ASC LIMIT 25`
    );
    await Promise.all(
      admins.rows.map((row) =>
        createWorkspaceNotification({
          ownerId: row.id,
          type: 'mentor.application.submitted',
          title: `New ${track === 'academy' ? 'Academy-grown' : 'external professional'} mentor application`,
          detail: 'A mentor application is waiting for review.',
          href: '/admin?tab=mentors',
          severity: 'info',
          sourceType: 'mentor-application',
          sourceId: applicationId,
          dedupeKey: `mentor-application:${applicationId}:submitted:${Date.now()}`,
        })
      )
    );
  } catch (error) {
    console.warn('Mentor application reviewer notification failed:', error);
  }
}

function isUniqueViolation(error: unknown) {
  return (error as { code?: string } | null)?.code === '23505';
}

export async function submitMentorApplication(userId: string, input: MentorApplicationInput) {
  let application: MentorApplicationSummary;
  try {
    application = await transaction(async (client) => {
      // Serialise concurrent submissions from the same account.
      const user = await client.query(`SELECT id FROM users WHERE id=$1 AND is_active=true FOR UPDATE`, [userId]);
      if (!user.rows[0]) throw new MentorshipError('Account not found.', 'ACCOUNT_NOT_FOUND', 404);

      const profile = await loadOwnProfile(client, userId);
      const gate = await evaluateApplyGate(
        client,
        userId,
        (profile?.status as MentorProfileStatus) ?? null,
        profile?.status_changed_at ? new Date(profile.status_changed_at) : null
      );
      if (!gate.canApply) throw new MentorshipError(gate.reason || 'You cannot apply right now.', gate.code || 'CANNOT_APPLY');

      const eligibility = await getMentorEligibility(userId, client);
      assertSpecializationsAllowed(input.track, input.specializations, eligibility);

      const inserted = await client.query(
        `INSERT INTO mentor_applications (
           applicant_id, track, headline, bio, specializations, years_experience, teaching_background,
           motivation, credentials, profile_url, timezone, eligibility_snapshot,
           code_of_conduct_version, code_of_conduct_accepted_at
         ) VALUES ($1,$2,$3,$4,$5::text[],$6,$7,$8,$9::jsonb,$10,$11,$12::jsonb,$13,NOW())
         RETURNING ${APPLICANT_APPLICATION_COLUMNS}`,
        [
          userId,
          input.track,
          input.headline,
          input.bio,
          input.specializations,
          input.yearsExperience,
          input.teachingBackground,
          input.motivation,
          stringifyPostgresJson(input.credentials),
          input.profileUrl ?? null,
          input.timezone,
          stringifyPostgresJson(eligibilitySnapshot(input.track, input.specializations, eligibility)),
          MENTOR_CODE_OF_CONDUCT_VERSION,
        ]
      );
      const row = inserted.rows[0];
      await recordApplicationEvent(client, { applicationId: row.id, applicantId: userId, actorId: userId, actorKind: 'applicant', from: null, to: 'submitted' });
      return mapApplication(row);
    });
  } catch (error) {
    if (isUniqueViolation(error)) throw new MentorshipError('You already have an application in progress.', 'APPLICATION_OPEN');
    throw error;
  }
  await notifyReviewers(application.id, application.track);
  return application;
}

async function lockOwnApplication(client: PoolClient, userId: string, applicationId: string) {
  const result = await client.query(
    `SELECT id, applicant_id, status, track FROM mentor_applications WHERE id=$1 AND applicant_id=$2 FOR UPDATE`,
    [applicationId, userId]
  );
  const row = result.rows[0] as { id: string; applicant_id: string; status: MentorApplicationStatus; track: MentorTrack } | undefined;
  // Another user's application is indistinguishable from a missing one.
  if (!row) throw new MentorshipError('Application not found.', 'APPLICATION_NOT_FOUND', 404);
  return row;
}

export async function withdrawMentorApplication(userId: string, applicationId: string) {
  return transaction(async (client) => {
    const current = await lockOwnApplication(client, userId, applicationId);
    if (!['submitted', 'under_review', 'changes_requested'].includes(current.status)) {
      throw new MentorshipError('Only an application in progress can be withdrawn.', 'INVALID_TRANSITION');
    }
    const updated = await client.query(
      `UPDATE mentor_applications SET status='withdrawn', updated_at=NOW() WHERE id=$1 RETURNING ${APPLICANT_APPLICATION_COLUMNS}`,
      [applicationId]
    );
    await recordApplicationEvent(client, { applicationId, applicantId: userId, actorId: userId, actorKind: 'applicant', from: current.status, to: 'withdrawn' });
    return mapApplication(updated.rows[0]);
  });
}

export async function resubmitMentorApplication(userId: string, applicationId: string, input: MentorApplicationInput) {
  const application = await transaction(async (client) => {
    const current = await lockOwnApplication(client, userId, applicationId);
    if (current.status !== 'changes_requested') {
      throw new MentorshipError('Only applications with requested changes can be resubmitted.', 'INVALID_TRANSITION');
    }
    if (current.track !== input.track) {
      throw new MentorshipError('The application track cannot change. Withdraw and apply again instead.', 'TRACK_IMMUTABLE');
    }
    const eligibility = await getMentorEligibility(userId, client);
    assertSpecializationsAllowed(input.track, input.specializations, eligibility);
    const updated = await client.query(
      `UPDATE mentor_applications
          SET status='submitted', headline=$2, bio=$3, specializations=$4::text[], years_experience=$5,
              teaching_background=$6, motivation=$7, credentials=$8::jsonb, profile_url=$9, timezone=$10,
              eligibility_snapshot=$11::jsonb, code_of_conduct_version=$12, code_of_conduct_accepted_at=NOW(),
              decision_note=NULL, decided_by=NULL, decided_at=NULL, submitted_at=NOW(), updated_at=NOW()
        WHERE id=$1
        RETURNING ${APPLICANT_APPLICATION_COLUMNS}`,
      [
        applicationId,
        input.headline,
        input.bio,
        input.specializations,
        input.yearsExperience,
        input.teachingBackground,
        input.motivation,
        stringifyPostgresJson(input.credentials),
        input.profileUrl ?? null,
        input.timezone,
        stringifyPostgresJson(eligibilitySnapshot(input.track, input.specializations, eligibility)),
        MENTOR_CODE_OF_CONDUCT_VERSION,
      ]
    );
    await recordApplicationEvent(client, { applicationId, applicantId: userId, actorId: userId, actorKind: 'applicant', from: 'changes_requested', to: 'submitted' });
    return mapApplication(updated.rows[0]);
  });
  await notifyReviewers(application.id, application.track);
  return application;
}

/* ---------------------------------------------------------------- profile */

export async function updateOwnMentorProfile(userId: string, update: MentorProfileUpdate) {
  return transaction(async (client) => {
    const current = await client.query(`SELECT status FROM mentor_profiles WHERE user_id=$1 FOR UPDATE`, [userId]);
    const status = current.rows[0]?.status as MentorProfileStatus | undefined;
    if (!status) throw new MentorshipError('You do not have a mentor profile.', 'PROFILE_NOT_FOUND', 404);
    if (status !== 'active' && status !== 'paused') {
      throw new MentorshipError('This mentor profile cannot be edited while it is suspended or revoked.', 'PROFILE_LOCKED', 403);
    }
    const nextStatus = update.paused === undefined ? status : update.paused ? 'paused' : 'active';
    await client.query(
      `UPDATE mentor_profiles
          SET headline=COALESCE($2, headline),
              bio=COALESCE($3, bio),
              timezone=COALESCE($4, timezone),
              availability_note=COALESCE($5, availability_note),
              is_listed=COALESCE($6, is_listed),
              status=$7,
              status_changed_at=CASE WHEN status<>$7 THEN NOW() ELSE status_changed_at END,
              status_changed_by=CASE WHEN status<>$7 THEN $1::uuid ELSE status_changed_by END,
              status_reason=CASE WHEN status<>$7 THEN NULL ELSE status_reason END,
              updated_at=NOW()
        WHERE user_id=$1`,
      [userId, update.headline ?? null, update.bio ?? null, update.timezone ?? null, update.availabilityNote ?? null, update.isListed ?? null, nextStatus]
    );
    return { status: nextStatus };
  });
}

/* -------------------------------------------------------------- directory */

const PUBLIC_PROFILE_SQL = `SELECT profile.user_id, profile.track, profile.tier, profile.headline, profile.bio,
         profile.timezone, profile.availability_note, profile.verified_credentials, profile.approved_at,
         account.display_name, account.avatar_url
    FROM mentor_profiles profile
    JOIN users account ON account.id=profile.user_id
   WHERE profile.status='active' AND profile.is_listed=true
     AND account.is_active=true AND account.suspended_at IS NULL
     AND EXISTS (
       SELECT 1 FROM mentor_qualifications qualification
        WHERE qualification.mentor_id=profile.user_id AND qualification.status='active'
          AND ($1::text IS NULL OR qualification.specialization_id=$1)
     )`;

export const PUBLIC_MENTOR_PROFILE_SQL = PUBLIC_PROFILE_SQL;

export function mapOffering(row: Record<string, any>): MentorOfferingView {
  return {
    id: row.id,
    kind: row.kind,
    title: row.title,
    description: row.description || '',
    durationMinutes: Number(row.duration_minutes),
    specializationIds: row.specialization_ids || [],
    isActive: Boolean(row.is_active),
  };
}

/** Active offerings (restricted to still-active qualifications) and whether weekly availability exists. */
async function loadBookingSurface(queryable: Queryable, mentorIds: string[]) {
  const offerings = new Map<string, MentorOfferingView[]>();
  const withRules = new Set<string>();
  if (!mentorIds.length) return { offerings, withRules };
  try {
    const [offeringRows, ruleRows] = await Promise.all([
      queryable.query(
        `SELECT offering.id, offering.mentor_id, offering.kind, offering.title, offering.description,
                offering.duration_minutes, offering.specialization_ids, offering.is_active
           FROM mentor_session_offerings offering
          WHERE offering.mentor_id = ANY($1::uuid[]) AND offering.is_active=true
          ORDER BY offering.duration_minutes ASC, offering.created_at ASC`,
        [mentorIds]
      ),
      queryable.query(
        `SELECT DISTINCT mentor_id FROM mentor_availability_rules WHERE mentor_id = ANY($1::uuid[])`,
        [mentorIds]
      ),
    ]);
    for (const row of offeringRows.rows) {
      if (!offerings.has(row.mentor_id)) offerings.set(row.mentor_id, []);
      offerings.get(row.mentor_id)!.push(mapOffering(row));
    }
    for (const row of ruleRows.rows) withRules.add(row.mentor_id);
  } catch (error) {
    // Before migration 062 the directory still works, without booking.
    if ((error as { code?: string } | null)?.code !== '42P01') throw error;
  }
  return { offerings, withRules };
}

function mapPublicProfile(
  row: Record<string, any>,
  qualifications: MentorQualificationView[],
  surface: { offerings: MentorOfferingView[]; hasRules: boolean }
): PublicMentorProfile {
  const qualified = new Set(qualifications.map((item) => item.specializationId));
  const offerings = surface.offerings
    .map((offering) => ({ ...offering, specializationIds: offering.specializationIds.filter((id) => qualified.has(id)) }))
    .filter((offering) => offering.specializationIds.length > 0);
  return {
    mentorId: row.user_id,
    // Email is never exposed; fall back to a neutral label.
    displayName: (row.display_name as string | null)?.trim() || 'OXSIG mentor',
    avatarUrl: row.avatar_url || null,
    track: row.track,
    tier: row.tier,
    headline: row.headline,
    bio: row.bio,
    timezone: row.timezone,
    availabilityNote: row.availability_note || '',
    verifiedCredentials: verifiedCredentials(row.verified_credentials),
    qualifications,
    approvedAt: iso(row.approved_at)!,
    offerings,
    bookingAvailable: offerings.length > 0 && surface.hasRules,
    reviewCount: 0,
  };
}

export async function listMentorDirectory(filters: { specializationId?: string | null; track?: MentorTrack | null; limit?: number }) {
  const specialization = filters.specializationId && getMentorSpecialization(filters.specializationId) ? filters.specializationId : null;
  const pool = getPool();
  const result = await pool.query(
    `${PUBLIC_PROFILE_SQL}
       AND ($2::text IS NULL OR profile.track=$2)
     ORDER BY CASE profile.tier WHEN 'senior_mentor' THEN 0 WHEN 'verified_mentor' THEN 1 ELSE 2 END, profile.approved_at ASC
     LIMIT $3`,
    [specialization, filters.track ?? null, Math.min(Math.max(filters.limit ?? 60, 1), 100)]
  );
  const ids = result.rows.map((row) => row.user_id as string);
  const [qualifications, surface] = await Promise.all([loadActiveQualifications(pool, ids), loadBookingSurface(pool, ids)]);
  return result.rows.map((row) =>
    mapPublicProfile(row, qualifications.get(row.user_id) ?? [], {
      offerings: surface.offerings.get(row.user_id) ?? [],
      hasRules: surface.withRules.has(row.user_id),
    })
  );
}

export async function getPublicMentorProfile(mentorId: string) {
  const pool = getPool();
  const result = await pool.query(`${PUBLIC_PROFILE_SQL} AND profile.user_id=$2 LIMIT 1`, [null, mentorId]);
  const row = result.rows[0];
  if (!row) return null;
  const [qualifications, surface] = await Promise.all([loadActiveQualifications(pool, [mentorId]), loadBookingSurface(pool, [mentorId])]);
  return mapPublicProfile(row, qualifications.get(mentorId) ?? [], {
    offerings: surface.offerings.get(mentorId) ?? [],
    hasRules: surface.withRules.has(mentorId),
  });
}
