import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const { Client } = pg;

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  console.error('DATABASE_URL is required.');
  process.exit(1);
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const migrationsDir = path.resolve(__dirname, '..', 'migrations');

const orderedMigrations = [
  '001_initial_schema.sql',
  '002_add_password_auth.sql',
  // 003 is explicitly deprecated and superseded by 004.
  '004_collaboration_system.sql',
  '005_add_user_profile_columns.sql',
  '006_add_missing_indexes.sql',
  '007_social_recovery.sql',
  '008_webauthn_credentials.sql',
  '009_user_keys_and_devices.sql',
  '010_cyber_labs_foundation.sql',
];

const client = new Client({
  connectionString,
  ssl: process.env.POSTGRES_SSL === 'disable'
    ? false
    : { rejectUnauthorized: process.env.POSTGRES_SSL_REJECT_UNAUTHORIZED === 'true' },
});

async function main() {
  await client.connect();

  await client.query(`
    CREATE TABLE IF NOT EXISTS oxisg_schema_migrations (
      filename TEXT PRIMARY KEY,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  for (const filename of orderedMigrations) {
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

  console.log('Database migrations complete.');
}

main()
  .catch((error) => {
    console.error('Migration failed:', error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await client.end().catch(() => undefined);
  });
