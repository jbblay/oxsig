import { afterEach, describe, expect, it } from 'vitest';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { inspectSchemaParity, REQUIRED_RUNTIME_RELATIONS } from './schema-parity-lib.mjs';

const tempDirs = [];

async function repositoryWithMigrations(names) {
  const root = await mkdtemp(path.join(os.tmpdir(), 'oxsig-schema-parity-'));
  tempDirs.push(root);
  await mkdir(path.join(root, 'migrations'));
  for (const name of names) {
    await writeFile(path.join(root, 'migrations', name), '-- test migration\n', 'utf8');
  }
  return root;
}

function database({ migrationTable = true, applied = [], relations = REQUIRED_RUNTIME_RELATIONS } = {}) {
  return {
    async query(sql) {
      if (sql.includes("to_regclass('public.oxisg_schema_migrations')")) {
        return { rows: [{ table_name: migrationTable ? 'oxisg_schema_migrations' : null }] };
      }
      if (sql.includes('SELECT filename FROM oxisg_schema_migrations')) {
        return { rows: applied.map((filename) => ({ filename })) };
      }
      if (sql.includes('FROM pg_class c')) {
        return { rows: relations.map((relation_name) => ({ relation_name })) };
      }
      throw new Error(`Unexpected query: ${sql}`);
    },
  };
}

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

describe('inspectSchemaParity', () => {
  it('reports ready when every repository migration is applied and runtime shape matches', async () => {
    const migrations = ['001_initial.sql', '002_second.sql'];
    const rootDir = await repositoryWithMigrations(migrations);

    const result = await inspectSchemaParity(database({ applied: migrations }), { rootDir });

    expect(result.ready).toBe(true);
    expect(result.reason).toBe('in_sync');
    expect(result.pendingMigrations).toEqual([]);
    expect(result.unknownAppliedMigrations).toEqual([]);
    expect(result.missingRuntimeRelations).toEqual([]);
    expect(result.unexpectedRetiredRelations).toEqual([]);
  });

  it('reports every repository migration pending when the history table is missing', async () => {
    const migrations = ['001_initial.sql', '002_second.sql'];
    const rootDir = await repositoryWithMigrations(migrations);

    const result = await inspectSchemaParity(database({ migrationTable: false }), { rootDir });

    expect(result.ready).toBe(false);
    expect(result.reason).toBe('migration_table_missing');
    expect(result.pendingMigrations).toEqual(migrations);
  });

  it('reports repository migrations that have not been applied', async () => {
    const rootDir = await repositoryWithMigrations(['001_initial.sql', '002_second.sql', '003_third.sql']);

    const result = await inspectSchemaParity(database({ applied: ['001_initial.sql'] }), { rootDir });

    expect(result.ready).toBe(false);
    expect(result.reason).toBe('pending_migrations');
    expect(result.pendingMigrations).toEqual(['002_second.sql', '003_third.sql']);
  });

  it('rejects database migration history that is ahead of or divergent from the repository', async () => {
    const rootDir = await repositoryWithMigrations(['001_initial.sql']);

    const result = await inspectSchemaParity(
      database({ applied: ['001_initial.sql', '999_unknown.sql'] }),
      { rootDir }
    );

    expect(result.ready).toBe(false);
    expect(result.reason).toBe('unknown_applied_migrations');
    expect(result.unknownAppliedMigrations).toEqual(['999_unknown.sql']);
  });

  it('rejects current migration history when a required runtime relation is missing', async () => {
    const migrations = ['001_initial.sql'];
    const rootDir = await repositoryWithMigrations(migrations);
    const relations = REQUIRED_RUNTIME_RELATIONS.filter((name) => name !== 'vault_items');

    const result = await inspectSchemaParity(database({ applied: migrations, relations }), { rootDir });

    expect(result.ready).toBe(false);
    expect(result.reason).toBe('runtime_relations_missing');
    expect(result.missingRuntimeRelations).toEqual(['vault_items']);
  });

  it('rejects current migration history when a retired relation is still present', async () => {
    const migrations = ['001_initial.sql'];
    const rootDir = await repositoryWithMigrations(migrations);

    const result = await inspectSchemaParity(
      database({ applied: migrations, relations: [...REQUIRED_RUNTIME_RELATIONS, 'documents'] }),
      { rootDir }
    );

    expect(result.ready).toBe(false);
    expect(result.reason).toBe('retired_relations_present');
    expect(result.unexpectedRetiredRelations).toEqual(['documents']);
  });
});
