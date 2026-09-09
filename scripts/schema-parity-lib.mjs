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
  'academy_practice_attempts',
  'academy_progress',
  'academy_questions',
  'academy_sessions',
  'ai_practitioner_events',
  'audit_logs',
  'collaboration_invitations',
  'collaboration_members',
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
  'live_workspace_control_leases',
  'live_workspace_control_requests',
  'live_workspace_participants',
  'live_workspace_resources',
  'live_workspaces',
  'operation_nodes',
  'operation_runs',
  'oxisg_schema_migrations',
  'rate_limit_buckets',
  'storyboard_sessions',
  'storyboard_shares',
  'terminal_bridge_ticket_uses',
  'vault_items',
];

export const RETIRED_RUNTIME_RELATIONS = [
  'documents',
  'oauth_accounts',
  'signatures',
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
  const unknownAppliedMigrations = appliedMigrations.filter((filename) => !repositorySet.has(filename));

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
    return `Database migration history is current, but ${result.missingRuntimeRelations.length} required runtime relation(s) are missing: ${preview}${suffix}.`;
  }

  const preview = result.unexpectedRetiredRelations.slice(0, 5).join(', ');
  const suffix = result.unexpectedRetiredRelations.length > 5
    ? ` (+${result.unexpectedRetiredRelations.length - 5} more)`
    : '';
  return `Database migration history is current, but ${result.unexpectedRetiredRelations.length} retired relation(s) are still present: ${preview}${suffix}.`;
}
