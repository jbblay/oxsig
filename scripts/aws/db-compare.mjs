// Verify that a migrated database matches its source, table by table.
//
//   SOURCE_DATABASE_URL=postgres://...neon...  TARGET_DATABASE_URL=postgres://...rds... \
//     node scripts/aws/db-compare.mjs [--counts-only]
//
// Run while the source is read-only (maintenance window) or after logical
// replication has caught up. Read-only on both databases. Exit 1 on any drift.
import pg from 'pg';
import { compareSnapshots, snapshotDatabase } from './db-compare-lib.mjs';

const sourceUrl = process.env.SOURCE_DATABASE_URL;
const targetUrl = process.env.TARGET_DATABASE_URL;
if (!sourceUrl || !targetUrl) {
  console.error('SOURCE_DATABASE_URL and TARGET_DATABASE_URL are required.');
  process.exit(1);
}
if (sourceUrl === targetUrl) {
  console.error('Source and target must be different databases.');
  process.exit(1);
}

const contentChecks = !process.argv.includes('--counts-only');
const connect = async (connectionString) => {
  const client = new pg.Client({ connectionString, application_name: 'oxsig-db-compare' });
  await client.connect();
  await client.query('SET default_transaction_read_only = on');
  await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
  return client;
};

const source = await connect(sourceUrl);
const target = await connect(targetUrl);
try {
  const [a, b] = await Promise.all([snapshotDatabase(source, { contentChecks }), snapshotDatabase(target, { contentChecks })]);
  const result = compareSnapshots(a, b);
  console.log(JSON.stringify({ ok: result.ok, tablesCompared: result.tablesCompared, contentChecks, problems: result.problems }, null, 2));
  process.exitCode = result.ok ? 0 : 1;
} finally {
  await Promise.allSettled([source.query('ROLLBACK'), target.query('ROLLBACK')]);
  await Promise.allSettled([source.end(), target.end()]);
}
