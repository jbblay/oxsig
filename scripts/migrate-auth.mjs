import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const { Client } = pg;
const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  console.error('DATABASE_URL is required for the auth database bootstrap.');
  process.exit(1);
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const migrationsDir = path.resolve(__dirname, '..', 'migrations');

// Authentication only. Do not pull unrelated collaboration/lab migrations into
// a production auth recovery operation.
const authMigrations = [
  '001_initial_schema.sql',
  '002_add_password_auth.sql',
  '005_add_user_profile_columns.sql',
];

const client = new Client({ connectionString });
const advisoryLockName = 'oxsig-auth-bootstrap-v1';

async function main() {
  await client.connect();

  // Serialise concurrent Preview/Production builds that share one database.
  await client.query('SELECT pg_advisory_lock(hashtext($1))', [advisoryLockName]);

  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS oxisg_schema_migrations (
        filename TEXT PRIMARY KEY,
        applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    for (const filename of authMigrations) {
      const alreadyApplied = await client.query(
        'SELECT 1 FROM oxisg_schema_migrations WHERE filename = $1',
        [filename]
      );

      if (alreadyApplied.rowCount) {
        console.log(`skip ${filename}`);
        continue;
      }

      const sql = await fs.readFile(path.join(migrationsDir, filename), 'utf8');

      console.log(`apply ${filename}`);
      await client.query('BEGIN');
      try {
        await client.query(sql);
        await client.query(
          'INSERT INTO oxisg_schema_migrations (filename) VALUES ($1)',
          [filename]
        );
        await client.query('COMMIT');
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      }
    }

    // Verify exactly what signup/login require before declaring success.
    const verification = await client.query(`
      SELECT
        to_regclass('public.users') IS NOT NULL AS users_table,
        to_regclass('public.sessions') IS NOT NULL AS sessions_table,
        EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_schema = 'public' AND table_name = 'users' AND column_name = 'password_hash'
        ) AS password_hash_column,
        EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_schema = 'public' AND table_name = 'users' AND column_name = 'role'
        ) AS role_column
    `);

    const readiness = verification.rows[0];
    if (!readiness.users_table || !readiness.sessions_table || !readiness.password_hash_column || !readiness.role_column) {
      throw new Error('Authentication schema verification failed after migrations.');
    }

    console.log('Authentication database bootstrap complete and verified.');
  } finally {
    await client.query('SELECT pg_advisory_unlock(hashtext($1))', [advisoryLockName]).catch(() => undefined);
  }
}

main()
  .catch((error) => {
    console.error('Authentication database bootstrap failed:', error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await client.end().catch(() => undefined);
  });
