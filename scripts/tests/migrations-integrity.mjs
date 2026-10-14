// Static migration and schema-drift guards. Uses only Node built-ins so it runs
// in CodeBuild (via `pnpm test:run`) and anywhere Node 22 is available.
//
//   node --test scripts/tests/migrations-integrity.mjs
//   node scripts/tests/migrations-integrity.mjs --print-manifest   # after adding a migration
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  ALLOWED_DUPLICATE_MIGRATION_PREFIXES,
  REQUIRED_RUNTIME_RELATIONS,
  RETIRED_RUNTIME_RELATIONS,
} from '../schema-parity-lib.mjs';

const root = fileURLToPath(new URL('../..', import.meta.url));
const migrationsDir = join(root, 'migrations');
const manifestPath = join(migrationsDir, 'checksums.json');
const MIGRATION_PATTERN = /^\d{3}_.+\.sql$/;
// Migrations at or after this number must declare ON DELETE for every users FK.
const FK_POLICY_FROM = 58;

const migrationFiles = readdirSync(migrationsDir)
  .filter((name) => MIGRATION_PATTERN.test(name))
  .sort((a, b) => a.localeCompare(b));
const migrationSql = new Map(migrationFiles.map((name) => [name, readFileSync(join(migrationsDir, name), 'utf8')]));
const sha256 = (text) => createHash('sha256').update(text, 'utf8').digest('hex');

if (process.argv.includes('--print-manifest')) {
  const current = JSON.parse(readFileSync(manifestPath, 'utf8'));
  for (const name of migrationFiles) current.migrations[name] ??= sha256(migrationSql.get(name));
  console.log(JSON.stringify(current, null, 2));
  process.exit(0);
}

function stripSqlComments(sql) {
  return sql.replace(/--[^\n]*/g, '').replace(/\/\*[\s\S]*?\*\//g, '');
}

function liveTablesFromMigrations() {
  const live = new Set();
  for (const name of migrationFiles) {
    const sql = stripSqlComments(migrationSql.get(name));
    for (const match of sql.matchAll(/\bCREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?(?:public\.)?([a-z_][a-z0-9_]*)/gi)) {
      live.add(match[1].toLowerCase());
    }
    for (const match of sql.matchAll(/\bDROP\s+TABLE\s+(?:IF\s+EXISTS\s+)?([a-z0-9_,\s.]+?)(?:\s+CASCADE)?\s*;/gi)) {
      for (const dropped of match[1].split(',')) live.delete(dropped.trim().replace(/^public\./, '').toLowerCase());
    }
  }
  return live;
}

function sourceFiles(directory) {
  const files = [];
  for (const entry of readdirSync(directory)) {
    const path = join(directory, entry);
    if (statSync(path).isDirectory()) {
      files.push(...sourceFiles(path));
    } else if (/\.(ts|tsx|js|mjs)$/.test(entry) && !/\.(test|spec)\.[cm]?[jt]sx?$/.test(entry)) {
      files.push(path);
    }
  }
  return files;
}

/** Table names used as SQL targets in application source (FROM/JOIN/INTO/UPDATE/DELETE FROM). */
function sqlTableReferences() {
  const references = new Map();
  const files = [...sourceFiles(join(root, 'src')), join(root, 'server.mjs')];
  const pattern = /\b(?:FROM|JOIN|INSERT\s+INTO|UPDATE|DELETE\s+FROM)\s+(?:public\.)?([a-z_][a-z0-9_]*)\b/g;
  for (const file of files) {
    const text = readFileSync(file, 'utf8');
    // Only inspect template/string literals that look like SQL to avoid prose.
    for (const literal of text.matchAll(/`([^`]*)`|'([^'\n]*)'|"([^"\n]*)"/g)) {
      const body = literal[1] ?? literal[2] ?? literal[3] ?? '';
      if (!/\b(SELECT|INSERT|UPDATE|DELETE)\b/.test(body)) continue;
      for (const match of body.matchAll(pattern)) {
        const name = match[1];
        if (!references.has(name)) references.set(name, new Set());
        references.get(name).add(relative(root, file));
      }
    }
  }
  return references;
}

test('applied migrations are immutable (checksum manifest)', () => {
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8')).migrations;
  const edited = Object.entries(manifest)
    .filter(([name, hash]) => migrationSql.has(name) && sha256(migrationSql.get(name)) !== hash)
    .map(([name]) => name);
  assert.deepEqual(edited, [], `Migrations were edited after merge. Add a forward migration instead:\n${edited.join('\n')}`);

  const unlisted = migrationFiles.filter((name) => !(name in manifest));
  assert.deepEqual(
    unlisted,
    [],
    `New migrations must be recorded in migrations/checksums.json (node scripts/tests/migrations-integrity.mjs --print-manifest):\n${unlisted.join('\n')}`
  );

  const missing = Object.keys(manifest).filter((name) => !migrationSql.has(name));
  assert.deepEqual(missing, [], `Merged migrations must never be deleted or renamed:\n${missing.join('\n')}`);
});

test('no new duplicate numeric migration prefixes', () => {
  const byPrefix = new Map();
  for (const name of migrationFiles) {
    const prefix = name.slice(0, 3);
    byPrefix.set(prefix, [...(byPrefix.get(prefix) || []), name]);
  }
  const duplicates = [...byPrefix.entries()]
    .filter(([prefix, names]) => names.length > 1 && !ALLOWED_DUPLICATE_MIGRATION_PREFIXES.includes(prefix))
    .map(([, names]) => names.join(', '));
  assert.deepEqual(duplicates, []);
});

test('migrations do not manage transactions themselves (the runner wraps each file)', () => {
  const offenders = migrationFiles.filter((name) => {
    const sql = stripSqlComments(migrationSql.get(name));
    // DO $$ ... BEGIN ... END $$ blocks are fine; only bare statements count.
    const outsideDoBlocks = sql.replace(/\$\$[\s\S]*?\$\$/g, '');
    return /^\s*(BEGIN|COMMIT|ROLLBACK|START\s+TRANSACTION)\s*;/im.test(outsideDoBlocks) ||
      /\bCONCURRENTLY\b/i.test(outsideDoBlocks);
  });
  assert.deepEqual(offenders, []);
});

test('new foreign keys to users declare an ON DELETE action', () => {
  const offenders = [];
  for (const name of migrationFiles) {
    if (Number(name.slice(0, 3)) < FK_POLICY_FROM) continue;
    const sql = stripSqlComments(migrationSql.get(name));
    for (const match of sql.matchAll(/REFERENCES\s+users\s*\(\s*id\s*\)([^,;)]*)/gi)) {
      if (!/ON\s+DELETE/i.test(match[1])) offenders.push(`${name}: ${match[0].trim()}`);
    }
  }
  assert.deepEqual(offenders, [], 'Every users(id) FK must say ON DELETE CASCADE / SET NULL / RESTRICT explicitly');
});

test('application SQL never references retired relations', () => {
  const references = sqlTableReferences();
  const offenders = RETIRED_RUNTIME_RELATIONS
    .filter((name) => references.has(name))
    .map((name) => `${name}: ${[...references.get(name)].join(', ')}`);
  assert.deepEqual(offenders, [], 'Retired tables were dropped by migrations; querying them fails at runtime');
});

test('every table application SQL touches is created by a migration and checked by schema parity', () => {
  const live = liveTablesFromMigrations();
  const references = sqlTableReferences();
  const required = new Set(REQUIRED_RUNTIME_RELATIONS);
  // Created by scripts/migrate.mjs at bootstrap, not by numbered SQL migrations.
  // Keep checking its existence through REQUIRED_RUNTIME_RELATIONS and schema parity.
  const bootstrapTables = new Set(['oxisg_schema_migrations']);
  // Catalog, CTE and set-returning-function names that legitimately follow FROM/JOIN.
  const nonTables = new Set([
    'information_schema', 'pg_class', 'pg_namespace', 'pg_constraint', 'pg_indexes', 'pg_attribute',
    'unnest', 'jsonb_array_elements', 'jsonb_array_elements_text', 'jsonb_each', 'jsonb_object_keys',
    'generate_series', 'json_array_elements', 'lateral', 'only', 'set',
  ]);
  assert.match(readFileSync(join(root, 'scripts/migrate.mjs'), 'utf8'),
    /CREATE TABLE IF NOT EXISTS oxisg_schema_migrations/,
    'Migration runner must create its bootstrap ledger');
  const unknown = [];
  const unchecked = [];
  for (const [name, files] of references) {
    if (nonTables.has(name) || bootstrapTables.has(name)) continue;
    if (live.has(name)) {
      if (!required.has(name)) unchecked.push(name);
    } else if (/^[a-z]+_[a-z0-9_]+$/.test(name) || ['users', 'sessions', 'collaborations'].includes(name)) {
      unknown.push(`${name}: ${[...files].join(', ')}`);
    }
  }
  assert.deepEqual(unchecked.sort(), [], 'Tables used by the app must be listed in REQUIRED_RUNTIME_RELATIONS');
  // Unknown snake_case identifiers are usually CTE aliases; surface real misses only.
  const cteNames = new Set();
  for (const file of [...sourceFiles(join(root, 'src')), join(root, 'server.mjs')]) {
    const text = readFileSync(file, 'utf8');
    for (const match of text.matchAll(/\b([a-z_][a-z0-9_]*)\s+AS\s*(?:MATERIALIZED\s*)?\(/gi)) cteNames.add(match[1].toLowerCase());
  }
  const realUnknown = unknown.filter((entry) => !cteNames.has(entry.split(':')[0]));
  assert.deepEqual(realUnknown, [], 'Application SQL references tables no migration creates');
});
