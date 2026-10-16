import 'server-only';

import type { Pool } from 'pg';

/**
 * Tables exported for a data-portability request. Columns holding binary blobs,
 * credentials or runtime internals are stripped; everything else the user owns
 * is returned verbatim so the export is a faithful copy of their OXSIG record.
 */
const EXPORT_SOURCES: Array<{ key: string; table: string; ownerColumn: string; orderBy: string; omit?: string[] }> = [
  { key: 'sandboxCheckouts', table: 'sandbox_checkouts', ownerColumn: 'owner_id', orderBy: 'created_at' },
  { key: 'sandboxSubscriptions', table: 'sandbox_subscriptions', ownerColumn: 'owner_id', orderBy: 'updated_at' },
  { key: 'sandboxLearningCredits', table: 'sandbox_credit_entries', ownerColumn: 'owner_id', orderBy: 'created_at' },
  { key: 'sandboxMentorEarnings', table: 'sandbox_mentor_earnings', ownerColumn: 'mentor_id', orderBy: 'created_at' },
  { key: 'missionRuns', table: 'academy_mission_runs', ownerColumn: 'owner_id', orderBy: 'created_at', omit: ['lab_instance_id'] },
  { key: 'flightRecorder', table: 'academy_flight_events', ownerColumn: 'owner_id', orderBy: 'created_at' },
  { key: 'labs', table: 'lab_instances', ownerColumn: 'owner_id', orderBy: 'created_at', omit: ['runtime_external_id'] },
  { key: 'operationRuns', table: 'operation_runs', ownerColumn: 'owner_id', orderBy: 'created_at' },
  { key: 'academyProgress', table: 'academy_progress', ownerColumn: 'owner_id', orderBy: 'updated_at' },
  { key: 'academySessions', table: 'academy_sessions', ownerColumn: 'owner_id', orderBy: 'started_at' },
  { key: 'academyMastery', table: 'academy_mastery', ownerColumn: 'owner_id', orderBy: 'updated_at' },
  { key: 'academyPracticeAttempts', table: 'academy_practice_attempts', ownerColumn: 'owner_id', orderBy: 'created_at' },
  { key: 'learningReflections', table: 'academy_learning_reflections', ownerColumn: 'owner_id', orderBy: 'created_at' },
  { key: 'learningPathEnrollments', table: 'learning_path_enrollments', ownerColumn: 'owner_id', orderBy: 'enrolled_at' },
  { key: 'learningCapabilityEvidence', table: 'learning_capability_evidence', ownerColumn: 'owner_id', orderBy: 'created_at' },
  { key: 'learningActivityDays', table: 'learning_activity_days', ownerColumn: 'owner_id', orderBy: 'activity_date' },
  { key: 'vaultItems', table: 'vault_items', ownerColumn: 'owner_id', orderBy: 'created_at' },
  { key: 'infrastructureDesigns', table: 'infrastructure_designs', ownerColumn: 'owner_id', orderBy: 'created_at' },
  { key: 'storyboards', table: 'storyboard_sessions', ownerColumn: 'owner_id', orderBy: 'created_at', omit: ['events', 'audio_data', 'audio_storage_key'] },
  { key: 'collaborationsOwned', table: 'collaborations', ownerColumn: 'owner_id', orderBy: 'created_at' },
  { key: 'collaborationMemberships', table: 'collaboration_members', ownerColumn: 'user_id', orderBy: 'joined_at', omit: ['permissions'] },
  { key: 'collaborationMessages', table: 'collaboration_messages', ownerColumn: 'user_id', orderBy: 'created_at' },
  { key: 'activityLog', table: 'audit_logs', ownerColumn: 'user_id', orderBy: 'created_at', omit: ['ip_address', 'user_agent'] },
  // Internal reviewer notes are an administrator work product, not applicant data.
  { key: 'mentorForge', table: 'mentor_forge_attempts', ownerColumn: 'owner_id', orderBy: 'created_at', omit: ['reviewer_id'] },
  { key: 'helpOutcomes', table: 'mentorship_help_outcomes', ownerColumn: 'owner_id', orderBy: 'created_at' },
  { key: 'mentorshipReviews', table: 'mentorship_reviews', ownerColumn: 'owner_id', orderBy: 'created_at', omit: ['reviewer_id','subject_id'] },
  { key: 'passportShares', table: 'skills_passport_shares', ownerColumn: 'owner_id', orderBy: 'created_at', omit: ['token_hash'] },
  { key: 'mentorApplications', table: 'mentor_applications', ownerColumn: 'applicant_id', orderBy: 'created_at', omit: ['reviewer_note', 'decided_by'] },
  { key: 'mentorApplicationEvents', table: 'mentor_application_events', ownerColumn: 'applicant_id', orderBy: 'created_at', omit: ['actor_id'] },
  { key: 'mentorProfile', table: 'mentor_profiles', ownerColumn: 'user_id', orderBy: 'created_at', omit: ['approved_by', 'status_changed_by'] },
  { key: 'mentorQualifications', table: 'mentor_qualifications', ownerColumn: 'mentor_id', orderBy: 'granted_at', omit: ['granted_by', 'revoked_by'] },
  { key: 'mentorSessionOfferings', table: 'mentor_session_offerings', ownerColumn: 'mentor_id', orderBy: 'created_at' },
  { key: 'mentorAvailability', table: 'mentor_availability_rules', ownerColumn: 'mentor_id', orderBy: 'created_at' },
  { key: 'mentorshipSessionsAsLearner', table: 'mentorship_sessions', ownerColumn: 'learner_id', orderBy: 'starts_at' },
  { key: 'mentorshipSessionsAsMentor', table: 'mentorship_sessions', ownerColumn: 'mentor_id', orderBy: 'starts_at', omit: ['shared_context', 'attempted_summary'] },
];

const ROW_LIMIT = 10_000;
const PROFILE_OMIT = ['password_hash', 'public_key', 'clerk_user_id', 'suspended_by', 'metadata'];

export async function buildAccountExport(pool: Pool, userId: string) {
  const profile = await pool.query(
    `SELECT to_jsonb(u) - $2::text[] AS doc FROM users u WHERE u.id=$1 LIMIT 1`,
    [userId, PROFILE_OMIT]
  );
  if (!profile.rows[0]) return null;

  const present = await pool.query(
    `SELECT relname FROM pg_class WHERE relkind='r' AND relname = ANY($1::text[])`,
    [EXPORT_SOURCES.map((source) => source.table)]
  );
  const available = new Set(present.rows.map((row) => row.relname as string));

  const data: Record<string, unknown[]> = {};
  const truncated: string[] = [];
  for (const source of EXPORT_SOURCES) {
    if (!available.has(source.table)) continue;
    // Identifiers come from the static allowlist above, never from input.
    const result = await pool.query(
      `SELECT to_jsonb(t) - $2::text[] AS doc
         FROM ${source.table} t
        WHERE t.${source.ownerColumn}=$1
        ORDER BY t.${source.orderBy} ASC NULLS LAST
        LIMIT ${ROW_LIMIT + 1}`,
      [userId, source.omit ?? []]
    );
    const rows = result.rows.map((row) => row.doc);
    if (rows.length > ROW_LIMIT) {
      rows.length = ROW_LIMIT;
      truncated.push(source.key);
    }
    data[source.key] = rows;
  }

  return {
    format: 'oxsig.account-export',
    version: 1,
    generatedAt: new Date().toISOString(),
    profile: profile.rows[0].doc,
    data,
    truncated,
  };
}
