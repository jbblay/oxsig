import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const { Client } = pg;

async function loadEnvValue(filename, key) {
  try {
    const text = await fs.readFile(path.resolve(process.cwd(), filename), 'utf8');
    for (const line of text.split(/\r?\n/)) {
      const match = line.match(new RegExp(`^\\s*(?:export\\s+)?${key}\\s*=\\s*(.*)\\s*$`));
      if (!match) continue;

      let value = match[1].trim();
      if (
        value.length >= 2 &&
        ((value.startsWith('"') && value.endsWith('"')) ||
          (value.startsWith("'") && value.endsWith("'")))
      ) {
        value = value.slice(1, -1);
      }
      return value;
    }
  } catch (error) {
    if (error?.code !== 'ENOENT') throw error;
  }
  return undefined;
}

if (!process.env.DATABASE_URL) {
  process.env.DATABASE_URL =
    (await loadEnvValue('.env.local', 'DATABASE_URL')) ||
    (await loadEnvValue('.env', 'DATABASE_URL'));
}

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  console.error('DATABASE_URL is required. Add it to .env.local or export it in the shell.');
  process.exit(1);
}

const __filename = fileURLToPath(import.meta.url);
const migrationsDir = path.resolve(path.dirname(__filename), '..', 'migrations');
const orderedMigrations = [
  '001_initial_schema.sql',
  '002_add_password_auth.sql',
  '004_collaboration_system.sql',
  '005_add_user_profile_columns.sql',
  '006_add_missing_indexes.sql',
  '007_social_recovery.sql',
  '008_webauthn_credentials.sql',
  '009_user_keys_and_devices.sql',
  '010_cyber_labs_foundation.sql',
  '011_secure_storyboards.sql',
  '012_clerk_identity.sql',
  '013_add_user_role.sql',
  '014_clean_foundation.sql',
  '015_lab_lifecycle_guardrails.sql',
  '016_shared_rate_limits.sql',
];

const client = new Client({ connectionString });

async function main() {
  await client.connect();
  await client.query(`CREATE TABLE IF NOT EXISTS oxisg_schema_migrations (filename TEXT PRIMARY KEY, applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW())`);

  for (const filename of orderedMigrations) {
    const applied = await client.query('SELECT 1 FROM oxisg_schema_migrations WHERE filename=$1', [filename]);
    if (applied.rowCount) continue;
    const sql = await fs.readFile(path.join(migrationsDir, filename), 'utf8');
    await client.query('BEGIN');
    try {
      await client.query(sql);
      await client.query('INSERT INTO oxisg_schema_migrations(filename) VALUES($1)', [filename]);
      await client.query('COMMIT');
      console.log(`applied ${filename}`);
    } catch (error) {
      await client.query('ROLLBACK');
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(`${filename}: ${message}`);
    }
  }
}

main().catch((error) => {
  console.error('Migration failed:', error instanceof Error ? error.message : error);
  process.exitCode = 1;
}).finally(async () => {
  await client.end().catch(() => undefined);
});
