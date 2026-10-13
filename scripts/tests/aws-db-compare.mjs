import { test } from 'node:test';
import assert from 'node:assert/strict';
import { compareSnapshots, quoteIdent, snapshotDatabase, tableFingerprintSql } from '../aws/db-compare-lib.mjs';

const base = () => ({
  tables: { users: { rows: '2', digest: 'abc' }, vault_items: { rows: '5', digest: 'def' } },
  sequences: { audit_seq: '10' },
  ledger: { '001_initial_schema.sql': 'h1' },
});

test('identical snapshots match', () => {
  assert.deepEqual(compareSnapshots(base(), base()), { ok: true, problems: [], tablesCompared: 2 });
});

test('row count, content, missing table, ledger and sequence drift are all reported', () => {
  const target = base();
  target.tables.users.rows = '1';
  target.tables.vault_items.digest = 'zzz';
  target.tables.extra = { rows: '0', digest: '' };
  target.sequences.audit_seq = '9';
  target.ledger['001_initial_schema.sql'] = 'other';
  const result = compareSnapshots(base(), target);
  assert.equal(result.ok, false);
  assert.deepEqual(result.problems, [
    'table extra exists only on target',
    'table users row count 2 (source) != 1 (target)',
    'table vault_items content differs',
    'sequence audit_seq behind on target (9 < 10)',
    'migration ledger differs for 001_initial_schema.sql',
  ]);
});

test('target sequences may be ahead of the source', () => {
  const target = base();
  target.sequences.audit_seq = '50';
  assert.equal(compareSnapshots(base(), target).ok, true);
});

test('only catalog-shaped identifiers are interpolated into SQL', () => {
  assert.equal(quoteIdent('vault_items'), '"vault_items"');
  assert.throws(() => quoteIdent('users; DROP TABLE users'), /Refusing/);
  assert.match(tableFingerprintSql('users'), /FROM public\."users" t/);
});

test('snapshotDatabase collects tables, sequences and ledger', async () => {
  const client = {
    async query(sql) {
      if (sql.includes('FROM pg_class')) return { rows: [{ table_name: 'users' }] };
      if (sql.includes('md5(string_agg')) return { rows: [{ row_count: 3, digest: 'd' }] };
      if (sql.includes('pg_sequences')) return { rows: [{ name: 's', last_value: '7' }] };
      if (sql.includes('to_regclass')) return { rows: [{ t: 'oxisg_schema_migrations' }] };
      if (sql.includes('FROM oxisg_schema_migrations')) return { rows: [{ filename: '001.sql', checksum: 'x' }] };
      throw new Error(`unexpected ${sql}`);
    },
  };
  assert.deepEqual(await snapshotDatabase(client), {
    tables: { users: { rows: '3', digest: 'd' } },
    sequences: { s: '7' },
    ledger: { '001.sql': 'x' },
  });
});
