import { readdir } from 'node:fs/promises';
import path from 'node:path';

const MIGRATION_PATTERN = /^\d{3}_.+\.sql$/;

export const REQUIRED_RUNTIME_RELATIONS = [
  'users',
  'academy_courses',
  'academy_failure_attempts',
  'academy_instructor_interventions',
  'academy_learning_reflections',
  'academy_mastery',
  'academy_mission_progress',
  'academy_simulation_progress',
  'academy_mission_runs',
  'academy_flight_events',
  'sandbox_checkouts',
  'sandbox_subscriptions',
  'sandbox_credit_entries',
  'sandbox_mentor_earnings',
  'academy_practice_attempts',
  'academy_progress',
  'academy_questions',
  'academy_sessions',
  'ai_practitioner_events',
  'audit_logs',
  'clerk_identity_tombstones',
  'clerk_webhook_deliveries',
  'collaboration_action_items',
  'collaboration_invitations',
  'collaboration_members',
  'collaboration_message_reactions',
  'collaboration_messages',
  'collaborations',
  'deployment_authorizations',
  'execution_evidence',
  'infrastructure_designs',
  'lab_definitions',
  'lab_events',
  'lab_instances',
  'lab_topologies',
  'learning_activity_days',
  'learning_capability_evidence',
  'learning_path_enrollments',
  'live_workspace_activity_events',
  'live_workspace_control_leases',
  'live_workspace_control_requests',
  'live_workspace_items',
  'live_workspace_participants',
  'live_workspace_resources',
  'live_workspaces',
  'mentor_application_events',
  'mentor_applications',
  'mentor_availability_rules',
  'mentor_forge_attempts',
  'mentorship_attendance',
  'mentorship_help_outcomes',
  'mentorship_reviews',
  'mentorship_evidence_events',
  'skills_passport_shares',
  'mentor_profiles',
  'mentor_qualifications',
  'mentor_session_offerings',
  'mentorship_session_events',
  'mentorship_sessions',
  'operation_environments',
  'operation_nodes',
  'operation_runs',
  'oxisg_schema_migrations',
  'rate_limit_buckets',
  'storyboard_comments',
  'storyboard_invitations',
  'storyboard_sessions',
  'storyboard_shares',
  'storyboard_stream_sessions',
  'storyboard_stream_signals',
  'terminal_bridge_ticket_uses',
  'vault_items',
  'workspace_activity_events',
  'workspace_notifications',
  'workspace_recent_workspaces',
];

/**
 * Migration files that were applied on some long-lived databases and later
 * deleted from the repository. Their ledger rows are expected history, not
 * drift. 003 duplicated 004 and was removed in b394189.
 */
export const RETIRED_MIGRATION_FILENAMES = [
  '003_collaboration_system.sql',
];

/**
 * Pre-existing duplicate numeric prefixes. Both files are applied on live
 * databases, so renaming them would re-execute one; new duplicates are
 * rejected by scripts/migrations-integrity.test.mjs.
 */
export const ALLOWED_DUPLICATE_MIGRATION_PREFIXES = ['049'];

export const RETIRED_RUNTIME_RELATIONS = [
  'collaboration_activity',
  'collaboration_documents',
  'document_shares',
  'documents',
  'file_shares',
  'files',
  'oauth_accounts',
  'paired_devices',
  'recovery_packages',
  'recovery_session_shares',
  'recovery_sessions',
  'signatures',
  'user_crypto_keys',
  'webauthn_challenges',
  'webauthn_credentials',
  'webrtc_sessions',
];

export async function listRepositoryMigrations(rootDir = process.cwd()) {
  const migrationsDir = path.resolve(rootDir, 'migrations');
  const filenames = (await readdir(migrationsDir))
    .filter((filename) => MIGRATION_PATTERN.test(filename))
    .sort((a, b) => a.localeCompare(b));

  if (filenames.length === 0) {
    throw new Error(`No numbered SQL migrations were found in ${migrationsDir}`);
  }

  return filenames;
}

export async function inspectSchemaParity(database, { rootDir = process.cwd() } = {}) {
  const repositoryMigrations = await listRepositoryMigrations(rootDir);
  const migrationTable = await database.query(
    "SELECT to_regclass('public.oxisg_schema_migrations') AS table_name"
  );

  if (!migrationTable.rows[0]?.table_name) {
    return {
      ready: false,
      repositoryMigrations,
      appliedMigrations: [],
      pendingMigrations: repositoryMigrations,
      unknownAppliedMigrations: [],
      missingRuntimeRelations: REQUIRED_RUNTIME_RELATIONS,
      unexpectedRetiredRelations: [],
      reason: 'migration_table_missing',
    };
  }

  const applied = await database.query(
    'SELECT filename FROM oxisg_schema_migrations ORDER BY filename ASC'
  );
  const appliedMigrations = applied.rows
    .map((row) => String(row.filename || '').trim())
    .filter(Boolean)
    .sort((a, b) => a.localeCompare(b));

  const repositorySet = new Set(repositoryMigrations);
  const appliedSet = new Set(appliedMigrations);
  const pendingMigrations = repositoryMigrations.filter((filename) => !appliedSet.has(filename));
  const retiredSet = new Set(RETIRED_MIGRATION_FILENAMES);
  const unknownAppliedMigrations = appliedMigrations.filter(
    (filename) => !repositorySet.has(filename) && !retiredSet.has(filename)
  );

  const relationNames = [...new Set([...REQUIRED_RUNTIME_RELATIONS, ...RETIRED_RUNTIME_RELATIONS])];
  const relations = await database.query(
    `SELECT c.relname AS relation_name
       FROM pg_class c
       JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public'
        AND c.relkind IN ('r', 'p', 'v', 'm')
        AND c.relname = ANY($1::text[])`,
    [relationNames]
  );
  const existingRelations = new Set(relations.rows.map((row) => String(row.relation_name || '').trim()).filter(Boolean));
  const missingRuntimeRelations = REQUIRED_RUNTIME_RELATIONS.filter((name) => !existingRelations.has(name));
  const unexpectedRetiredRelations = RETIRED_RUNTIME_RELATIONS.filter((name) => existingRelations.has(name));

  const ready = pendingMigrations.length === 0 &&
    unknownAppliedMigrations.length === 0 &&
    missingRuntimeRelations.length === 0 &&
    unexpectedRetiredRelations.length === 0;

  return {
    ready,
    repositoryMigrations,
    appliedMigrations,
    pendingMigrations,
    unknownAppliedMigrations,
    missingRuntimeRelations,
    unexpectedRetiredRelations,
    reason:
      pendingMigrations.length > 0
        ? 'pending_migrations'
        : unknownAppliedMigrations.length > 0
          ? 'unknown_applied_migrations'
          : missingRuntimeRelations.length > 0
            ? 'runtime_relations_missing'
            : unexpectedRetiredRelations.length > 0
              ? 'retired_relations_present'
              : 'in_sync',
  };
}

export function describeSchemaParity(result) {
  const latest = result.repositoryMigrations.at(-1) || 'none';

  if (result.ready) {
    return `Database schema matches ${result.repositoryMigrations.length} repository migrations through ${latest}, with all required runtime relations present and retired relations absent.`;
  }

  if (result.reason === 'migration_table_missing') {
    return `Migration history table is missing; ${result.pendingMigrations.length} repository migration(s) require pnpm db:migrate.`;
  }

  if (result.pendingMigrations.length > 0) {
    const preview = result.pendingMigrations.slice(0, 3).join(', ');
    const suffix = result.pendingMigrations.length > 3 ? ` (+${result.pendingMigrations.length - 3} more)` : '';
    return `Database is missing ${result.pendingMigrations.length} repository migration(s): ${preview}${suffix}. Run pnpm db:migrate.`;
  }

  if (result.unknownAppliedMigrations.length > 0) {
    const preview = result.unknownAppliedMigrations.slice(0, 3).join(', ');
    const suffix = result.unknownAppliedMigrations.length > 3
      ? ` (+${result.unknownAppliedMigrations.length - 3} more)`
      : '';
    return `Database contains ${result.unknownAppliedMigrations.length} applied migration(s) absent from this repository: ${preview}${suffix}.`;
  }

  if (result.missingRuntimeRelations.length > 0) {
    const preview = result.missingRuntimeRelations.slice(0, 5).join(', ');
    const suffix = result.missingRuntimeRelations.length > 5
      ? ` (+${result.missingRuntimeRelations.length - 5} more)`
      : '';
    return `Database is missing required runtime relation(s): ${preview}${suffix}.`;
  }

  if (result.unexpectedRetiredRelations.length > 0) {
    const preview = result.unexpectedRetiredRelations.slice(0, 5).join(', ');
    const suffix = result.unexpectedRetiredRelations.length > 5
      ? ` (+${result.unexpectedRetiredRelations.length - 5} more)`
      : '';
    return `Database still contains retired runtime relation(s): ${preview}${suffix}.`;
  }

  return 'Database schema parity check failed for an unknown reason.';
}
