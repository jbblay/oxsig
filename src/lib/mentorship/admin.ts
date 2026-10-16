import 'server-only';

import type { Pool, PoolClient } from 'pg';
import { transaction } from '@/lib/db/pool';
import { stringifyPostgresJson } from '@/lib/db/postgres-safe';
import { createWorkspaceNotification } from '@/lib/notifications/server';
import {
  INITIAL_TIERS_BY_TRACK,
  MENTOR_TIER_LABELS,
  canTransitionMentorApplication,
  type MentorApplicationStatus,
  type MentorCredentialClaim,
  type MentorEligibility,
  type MentorProfileStatus,
  type MentorTier,
  type MentorTrack,
} from './policy';
import {
  APPLICANT_APPLICATION_COLUMNS,
  MentorshipError,
  getMentorEligibility,
  mapApplication,
  mapQualification,
  type Queryable,
} from './server';
import { getMentorSpecialization, mentorSpecializationLabel } from './specializations';

/*
 * Administrator review of mentor applications and approved mentors. Callers
 * must already be authorised as platform admins (withPlatformAdmin). Every
 * function here additionally refuses to let an administrator decide on their
 * own application or manage their own mentor profile.
 */

const iso = (value: unknown) => (value ? new Date(value as string).toISOString() : null);

export type ApplicationDecision =
  | { action: 'start_review'; reviewerNote?: string }
  | { action: 'request_changes'; note: string; reviewerNote?: string }
  | { action: 'reject'; note: string; reviewerNote?: string }
  | {
      action: 'approve';
      tier: MentorTier;
      specializationIds: string[];
      verifiedCredentialIndexes: number[];
      note?: string;
      reviewerNote?: string;
    };

export type MentorManagementAction =
  | { action: 'suspend'; reason: string }
  | { action: 'reinstate'; reason: string }
  | { action: 'revoke'; reason: string }
  | { action: 'set_tier'; tier: MentorTier; reason: string }
  | { action: 'grant_qualification'; specializationId: string; reason: string }
  | { action: 'revoke_qualification'; qualificationId: string; reason: string };

/* ------------------------------------------------------------------ reads */

export async function listMentorApplicationsForReview(pool: Pool, filters: { status: MentorApplicationStatus | 'open' | 'all' }) {
  const status = filters.status;
  const result = await pool.query(
    `SELECT application.id, application.track, application.status, application.headline, application.specializations,
            application.years_experience, application.submitted_at, application.updated_at, application.decided_at,
            account.id AS applicant_id, account.display_name, account.email, account.avatar_url
       FROM mentor_applications application
       JOIN users account ON account.id=application.applicant_id
      WHERE ($1::text='all')
         OR ($1::text='open' AND application.status IN ('submitted','under_review','changes_requested'))
         OR application.status=$1::text
      ORDER BY application.submitted_at ASC
      LIMIT 200`,
    [status]
  );
  const counts = await pool.query(`SELECT status, COUNT(*)::int AS count FROM mentor_applications GROUP BY status`);
  return {
    applications: result.rows.map((row) => ({
      id: row.id as string,
      track: row.track as MentorTrack,
      status: row.status as MentorApplicationStatus,
      headline: row.headline as string,
      specializations: (row.specializations || []) as string[],
      yearsExperience: Number(row.years_experience) || 0,
      submittedAt: iso(row.submitted_at)!,
      updatedAt: iso(row.updated_at)!,
      decidedAt: iso(row.decided_at),
      applicant: { id: row.applicant_id as string, displayName: row.display_name as string | null, email: row.email as string | null, avatarUrl: row.avatar_url as string | null },
    })),
    counts: Object.fromEntries(counts.rows.map((row) => [row.status, Number(row.count)])) as Record<string, number>,
  };
}

export async function getMentorApplicationForReview(pool: Pool, applicationId: string) {
  const result = await pool.query(
    `SELECT ${APPLICANT_APPLICATION_COLUMNS}, applicant_id, reviewer_note, eligibility_snapshot,
            code_of_conduct_version, code_of_conduct_accepted_at, decided_by
       FROM mentor_applications WHERE id=$1 LIMIT 1`,
    [applicationId]
  );
  const row = result.rows[0];
  if (!row) return null;
  const [applicant, events, currentEligibility, history] = await Promise.all([
    pool.query(
      `SELECT id, display_name, email, email_verified, avatar_url, created_at, suspended_at FROM users WHERE id=$1`,
      [row.applicant_id]
    ),
    pool.query(
      `SELECT event.id, event.actor_kind, event.from_status, event.to_status, event.note, event.created_at,
              actor.display_name AS actor_name
         FROM mentor_application_events event
         LEFT JOIN users actor ON actor.id=event.actor_id
        WHERE event.application_id=$1
        ORDER BY event.created_at ASC`,
      [applicationId]
    ),
    getMentorEligibility(row.applicant_id, pool),
    pool.query(
      `SELECT id, status, submitted_at, decided_at FROM mentor_applications
        WHERE applicant_id=$1 AND id<>$2 ORDER BY created_at DESC LIMIT 10`,
      [row.applicant_id, applicationId]
    ),
  ]);
  const account = applicant.rows[0];
  return {
    application: mapApplication(row),
    reviewerNote: (row.reviewer_note as string | null) || null,
    eligibilityAtSubmission: row.eligibility_snapshot ?? {},
    currentEligibility,
    codeOfConduct: { version: row.code_of_conduct_version as string, acceptedAt: iso(row.code_of_conduct_accepted_at) },
    applicant: account
      ? {
          id: account.id as string,
          displayName: account.display_name as string | null,
          email: account.email as string | null,
          emailVerified: Boolean(account.email_verified),
          avatarUrl: account.avatar_url as string | null,
          joinedAt: iso(account.created_at),
          suspended: Boolean(account.suspended_at),
        }
      : null,
    events: events.rows.map((event) => ({
      id: event.id as string,
      actorKind: event.actor_kind as string,
      actorName: event.actor_name as string | null,
      fromStatus: event.from_status as string | null,
      toStatus: event.to_status as string,
      note: event.note as string | null,
      at: iso(event.created_at)!,
    })),
    previousApplications: history.rows.map((item) => ({
      id: item.id as string,
      status: item.status as string,
      submittedAt: iso(item.submitted_at),
      decidedAt: iso(item.decided_at),
    })),
  };
}

export async function listMentorsForAdmin(pool: Pool) {
  const result = await pool.query(
    `SELECT profile.user_id, profile.track, profile.tier, profile.status, profile.status_reason, profile.is_listed,
            profile.approved_at, profile.headline, account.display_name, account.email, account.avatar_url
       FROM mentor_profiles profile
       JOIN users account ON account.id=profile.user_id
      ORDER BY profile.approved_at DESC
      LIMIT 500`
  );
  const ids = result.rows.map((row) => row.user_id);
  const qualifications = ids.length
    ? await pool.query(
        `SELECT id, mentor_id, specialization_id, basis, granted_at FROM mentor_qualifications
          WHERE mentor_id = ANY($1::uuid[]) AND status='active' ORDER BY granted_at ASC`,
        [ids]
      )
    : { rows: [] as Record<string, any>[] };
  return result.rows.map((row) => ({
    mentorId: row.user_id as string,
    track: row.track as MentorTrack,
    tier: row.tier as MentorTier,
    status: row.status as MentorProfileStatus,
    statusReason: row.status_reason as string | null,
    isListed: Boolean(row.is_listed),
    approvedAt: iso(row.approved_at)!,
    headline: row.headline as string,
    displayName: row.display_name as string | null,
    email: row.email as string | null,
    avatarUrl: row.avatar_url as string | null,
    qualifications: qualifications.rows.filter((item) => item.mentor_id === row.user_id).map(mapQualification),
  }));
}

/* -------------------------------------------------------------- decisions */

function assertAcademyEvidence(track: MentorTrack, specializationIds: string[], eligibility: MentorEligibility) {
  if (track !== 'academy') return;
  const missing = specializationIds.filter(
    (id) => !eligibility.specializations.find((item) => item.specializationId === id)?.eligible
  );
  if (missing.length) {
    throw new MentorshipError(
      `The applicant no longer has enough verified Academy evidence for: ${missing.map(mentorSpecializationLabel).join(', ')}.`,
      'EVIDENCE_REQUIRED',
      409,
      { specializations: missing }
    );
  }
}

function evidenceSnapshotFor(specializationId: string, eligibility: MentorEligibility) {
  const item = eligibility.specializations.find((entry) => entry.specializationId === specializationId);
  return item ? { capturedAt: new Date().toISOString(), ...item } : {};
}

async function recordEvent(
  client: Queryable,
  event: { applicationId: string; applicantId: string; actorId: string; from: MentorApplicationStatus; to: MentorApplicationStatus; note?: string | null }
) {
  await client.query(
    `INSERT INTO mentor_application_events (application_id, applicant_id, actor_id, actor_kind, from_status, to_status, note)
     VALUES ($1,$2,$3,'admin',$4,$5,$6)`,
    [event.applicationId, event.applicantId, event.actorId, event.from, event.to, event.note?.slice(0, 1000) ?? null]
  );
}

const DECISION_TARGET: Record<ApplicationDecision['action'], MentorApplicationStatus> = {
  start_review: 'under_review',
  request_changes: 'changes_requested',
  reject: 'rejected',
  approve: 'approved',
};

export async function decideMentorApplication(input: { adminId: string; applicationId: string; decision: ApplicationDecision }) {
  const { adminId, applicationId, decision } = input;
  const outcome = await transaction(async (client: PoolClient) => {
    const locked = await client.query(
      `SELECT id, applicant_id, track, status, specializations, credentials, headline, bio, timezone
         FROM mentor_applications WHERE id=$1 FOR UPDATE`,
      [applicationId]
    );
    const application = locked.rows[0];
    if (!application) throw new MentorshipError('Application not found.', 'APPLICATION_NOT_FOUND', 404);
    if (application.applicant_id === adminId) {
      throw new MentorshipError('Administrators cannot review their own mentor application.', 'SELF_REVIEW_FORBIDDEN', 403);
    }
    const from = application.status as MentorApplicationStatus;
    const to = DECISION_TARGET[decision.action];
    if (!canTransitionMentorApplication(from, to, 'admin')) {
      throw new MentorshipError(`An application that is ${from.replace('_', ' ')} cannot move to ${to.replace('_', ' ')}.`, 'INVALID_TRANSITION');
    }

    const note = decision.action === 'start_review' ? null : decision.note?.trim() || null;
    const reviewerNote = decision.reviewerNote?.trim() || null;

    if (decision.action === 'approve') {
      const track = application.track as MentorTrack;
      if (!INITIAL_TIERS_BY_TRACK[track].includes(decision.tier)) {
        throw new MentorshipError(
          `${MENTOR_TIER_LABELS[decision.tier]} cannot be granted at first approval on the ${track} track.`,
          'TIER_NOT_ALLOWED'
        );
      }
      const requested = new Set<string>(application.specializations || []);
      const specializationIds = [...new Set(decision.specializationIds)];
      if (!specializationIds.length) throw new MentorshipError('Approve at least one specialization.', 'SPECIALIZATION_REQUIRED', 400);
      const unknown = specializationIds.filter((id) => !requested.has(id) || !getMentorSpecialization(id));
      if (unknown.length) {
        throw new MentorshipError('Only specializations the applicant requested can be approved.', 'SPECIALIZATION_NOT_REQUESTED', 400, { specializations: unknown });
      }
      const eligibility = await getMentorEligibility(application.applicant_id, client);
      assertAcademyEvidence(track, specializationIds, eligibility);

      const claims: MentorCredentialClaim[] = Array.isArray(application.credentials) ? application.credentials : [];
      const invalidIndex = decision.verifiedCredentialIndexes.find((index) => index < 0 || index >= claims.length);
      if (invalidIndex !== undefined) throw new MentorshipError('Unknown credential selected for verification.', 'CREDENTIAL_NOT_FOUND', 400);
      const verifiedAt = new Date().toISOString();
      const verified = [...new Set(decision.verifiedCredentialIndexes)].sort((a, b) => a - b).map((index) => ({ ...claims[index], verifiedAt }));

      await client.query(
        `UPDATE mentor_applications
            SET status='approved', decision_note=$2, reviewer_note=COALESCE($3, reviewer_note),
                decided_by=$4, decided_at=NOW(), updated_at=NOW()
          WHERE id=$1`,
        [applicationId, note, reviewerNote, adminId]
      );
      // A previously revoked mentor may be re-approved; suspended or active ones
      // cannot reach here because they cannot submit a new application.
      const profile = await client.query(
        `INSERT INTO mentor_profiles (
           user_id, application_id, track, tier, status, headline, bio, timezone, verified_credentials,
           approved_by, approved_at, status_changed_by, status_changed_at
         ) VALUES ($1,$2,$3,$4,'active',$5,$6,$7,$8::jsonb,$9,NOW(),$9,NOW())
         ON CONFLICT (user_id) DO UPDATE
           SET application_id=EXCLUDED.application_id, track=EXCLUDED.track, tier=EXCLUDED.tier, status='active',
               headline=EXCLUDED.headline, bio=EXCLUDED.bio, timezone=EXCLUDED.timezone,
               verified_credentials=EXCLUDED.verified_credentials, approved_by=EXCLUDED.approved_by,
               approved_at=NOW(), status_reason=NULL, status_changed_by=EXCLUDED.approved_by,
               status_changed_at=NOW(), updated_at=NOW()
           WHERE mentor_profiles.status='revoked'
         RETURNING user_id`,
        [
          application.applicant_id,
          applicationId,
          track,
          decision.tier,
          application.headline,
          application.bio,
          application.timezone,
          stringifyPostgresJson(verified),
          adminId,
        ]
      );
      if (!profile.rows[0]) throw new MentorshipError('The applicant already has an active or suspended mentor profile.', 'PROFILE_EXISTS');

      for (const specializationId of specializationIds) {
        await client.query(
          `INSERT INTO mentor_qualifications (mentor_id, specialization_id, basis, evidence_snapshot, granted_by)
           VALUES ($1,$2,$3,$4::jsonb,$5)`,
          [
            application.applicant_id,
            specializationId,
            track === 'academy' ? 'academy_evidence' : 'professional_review',
            stringifyPostgresJson(track === 'academy' ? evidenceSnapshotFor(specializationId, eligibility) : { reviewedAt: verifiedAt }),
            adminId,
          ]
        );
      }
    } else {
      await client.query(
        `UPDATE mentor_applications
            SET status=$2,
                decision_note=CASE WHEN $2 IN ('changes_requested','rejected') THEN $3 ELSE decision_note END,
                reviewer_note=COALESCE($4, reviewer_note),
                decided_by=CASE WHEN $2='under_review' THEN decided_by ELSE $5::uuid END,
                decided_at=CASE WHEN $2='under_review' THEN decided_at ELSE NOW() END,
                updated_at=NOW()
          WHERE id=$1`,
        [applicationId, to, note, reviewerNote, adminId]
      );
    }

    await recordEvent(client, { applicationId, applicantId: application.applicant_id, actorId: adminId, from, to, note });
    const updated = await client.query(`SELECT ${APPLICANT_APPLICATION_COLUMNS} FROM mentor_applications WHERE id=$1`, [applicationId]);
    return { application: mapApplication(updated.rows[0]), applicantId: application.applicant_id as string, from, to };
  });

  await notifyApplicant(outcome.applicantId, outcome.application.id, outcome.to);
  return outcome;
}

async function notifyApplicant(applicantId: string, applicationId: string, status: MentorApplicationStatus) {
  const copy: Partial<Record<MentorApplicationStatus, { title: string; severity: 'info' | 'success' | 'warning' }>> = {
    under_review: { title: 'Your mentor application is under review', severity: 'info' },
    changes_requested: { title: 'Reviewers requested changes to your mentor application', severity: 'warning' },
    approved: { title: 'You are now an approved OXSIG mentor', severity: 'success' },
    rejected: { title: 'Your mentor application was not approved', severity: 'warning' },
  };
  const message = copy[status];
  if (!message) return;
  try {
    await createWorkspaceNotification({
      ownerId: applicantId,
      type: `mentor.application.${status}`,
      title: message.title,
      detail: 'Open Mentor center for details.',
      href: '/academy/mentor-center',
      severity: message.severity,
      sourceType: 'mentor-application',
      sourceId: applicationId,
      dedupeKey: `mentor-application:${applicationId}:${status}:${Date.now()}`,
    });
  } catch (error) {
    console.warn('Mentor applicant notification failed:', error);
  }
}

/* ------------------------------------------------------- mentor management */

export async function manageMentor(input: { adminId: string; mentorId: string; command: MentorManagementAction }) {
  const { adminId, mentorId, command } = input;
  if (mentorId === adminId) {
    throw new MentorshipError('Administrators cannot manage their own mentor profile.', 'SELF_MANAGEMENT_FORBIDDEN', 403);
  }
  const result = await transaction(async (client: PoolClient) => {
    const locked = await client.query(`SELECT user_id, track, tier, status FROM mentor_profiles WHERE user_id=$1 FOR UPDATE`, [mentorId]);
    const profile = locked.rows[0] as { user_id: string; track: MentorTrack; tier: MentorTier; status: MentorProfileStatus } | undefined;
    if (!profile) throw new MentorshipError('Mentor not found.', 'MENTOR_NOT_FOUND', 404);
    if (profile.status === 'revoked' && command.action !== 'revoke') {
      throw new MentorshipError('This mentor was revoked. They must submit a new application.', 'MENTOR_REVOKED');
    }

    const setStatus = (status: MentorProfileStatus) =>
      client.query(
        `UPDATE mentor_profiles SET status=$2, status_reason=$3, status_changed_by=$4, status_changed_at=NOW(), updated_at=NOW()
          WHERE user_id=$1`,
        [mentorId, status, command.reason, adminId]
      );

    switch (command.action) {
      case 'suspend':
        if (profile.status === 'suspended') throw new MentorshipError('Mentor is already suspended.', 'NO_CHANGE');
        await setStatus('suspended');
        return { status: 'suspended' as const };
      case 'reinstate':
        if (profile.status !== 'suspended') throw new MentorshipError('Only a suspended mentor can be reinstated.', 'INVALID_TRANSITION');
        await setStatus('active');
        return { status: 'active' as const };
      case 'revoke':
        if (profile.status === 'revoked') throw new MentorshipError('Mentor is already revoked.', 'NO_CHANGE');
        await setStatus('revoked');
        await client.query(
          `UPDATE mentor_qualifications SET status='revoked', revoked_by=$2, revoked_at=NOW(), revocation_reason=$3
            WHERE mentor_id=$1 AND status='active'`,
          [mentorId, adminId, command.reason]
        );
        return { status: 'revoked' as const };
      case 'set_tier':
        if (profile.tier === command.tier) throw new MentorshipError('Mentor already holds this tier.', 'NO_CHANGE');
        await client.query(`UPDATE mentor_profiles SET tier=$2, updated_at=NOW() WHERE user_id=$1`, [mentorId, command.tier]);
        return { tier: command.tier };
      case 'grant_qualification': {
        if (!getMentorSpecialization(command.specializationId)) throw new MentorshipError('Unknown specialization.', 'SPECIALIZATION_NOT_FOUND', 400);
        const eligibility = profile.track === 'academy' ? await getMentorEligibility(mentorId, client) : null;
        if (eligibility) assertAcademyEvidence('academy', [command.specializationId], eligibility);
        try {
          await client.query('SAVEPOINT grant_qualification');
          const inserted = await client.query(
            `INSERT INTO mentor_qualifications (mentor_id, specialization_id, basis, evidence_snapshot, granted_by)
             VALUES ($1,$2,$3,$4::jsonb,$5) RETURNING id, specialization_id, basis, granted_at`,
            [
              mentorId,
              command.specializationId,
              eligibility ? 'academy_evidence' : 'professional_review',
              stringifyPostgresJson(eligibility ? evidenceSnapshotFor(command.specializationId, eligibility) : { reviewedAt: new Date().toISOString(), reason: command.reason }),
              adminId,
            ]
          );
          await client.query('RELEASE SAVEPOINT grant_qualification');
          return { qualification: mapQualification(inserted.rows[0]) };
        } catch (error) {
          if ((error as { code?: string }).code === '23505') {
            await client.query('ROLLBACK TO SAVEPOINT grant_qualification');
            throw new MentorshipError('Mentor already holds this qualification.', 'NO_CHANGE');
          }
          throw error;
        }
      }
      case 'revoke_qualification': {
        const revoked = await client.query(
          `UPDATE mentor_qualifications SET status='revoked', revoked_by=$3, revoked_at=NOW(), revocation_reason=$4
            WHERE id=$1 AND mentor_id=$2 AND status='active' RETURNING id`,
          [command.qualificationId, mentorId, adminId, command.reason]
        );
        if (!revoked.rows[0]) throw new MentorshipError('Active qualification not found for this mentor.', 'QUALIFICATION_NOT_FOUND', 404);
        return { revokedQualificationId: command.qualificationId };
      }
    }
  });

  if (command.action === 'suspend' || command.action === 'revoke' || command.action === 'reinstate') {
    try {
      await createWorkspaceNotification({
        ownerId: mentorId,
        type: `mentor.profile.${command.action}`,
        title: command.action === 'reinstate' ? 'Your mentor profile was reinstated' : `Your mentor profile was ${command.action === 'suspend' ? 'suspended' : 'revoked'}`,
        detail: command.reason,
        href: '/academy/mentor-center',
        severity: command.action === 'reinstate' ? 'success' : 'warning',
        sourceType: 'mentor-profile',
        sourceId: mentorId,
        dedupeKey: `mentor-profile:${mentorId}:${command.action}:${Date.now()}`,
      });
    } catch (error) {
      console.warn('Mentor status notification failed:', error);
    }
  }
  return result;
}
