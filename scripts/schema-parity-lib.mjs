import { readdir } from 'node:fs/promises';
import path from 'node:path';

const MIGRATION_PATTERN = /^\d{3}_.+\.sql$/;

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

  return {
    ready: pendingMigrations.length === 0 && unknownAppliedMigrations.length === 0,
    repositoryMigrations,
    appliedMigrations,
    pendingMigrations,
    unknownAppliedMigrations,
    reason:
      pendingMigrations.length > 0
        ? 'pending_migrations'
        : unknownAppliedMigrations.length > 0
          ? 'unknown_applied_migrations'
          : 'in_sync',
  };
}

export function describeSchemaParity(result) {
  const latest = result.repositoryMigrations.at(-1) || 'none';

  if (result.ready) {
    return `Database schema matches ${result.repositoryMigrations.length} repository migrations through ${latest}.`;
  }

  if (result.reason === 'migration_table_missing') {
    return `Migration history table is missing; ${result.pendingMigrations.length} repository migration(s) require pnpm db:migrate.`;
  }

  if (result.pendingMigrations.length > 0) {
    const preview = result.pendingMigrations.slice(0, 3).join(', ');
    const suffix = result.pendingMigrations.length > 3 ? ` (+${result.pendingMigrations.length - 3} more)` : '';
    return `Database is missing ${result.pendingMigrations.length} repository migration(s): ${preview}${suffix}. Run pnpm db:migrate.`;
  }

  const preview = result.unknownAppliedMigrations.slice(0, 3).join(', ');
  const suffix = result.unknownAppliedMigrations.length > 3
    ? ` (+${result.unknownAppliedMigrations.length - 3} more)`
    : '';
  return `Database contains ${result.unknownAppliedMigrations.length} applied migration(s) absent from this repository: ${preview}${suffix}.`;
}
