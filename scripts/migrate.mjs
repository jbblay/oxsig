import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import pg from 'pg';

const { Client } = pg;
const migrationsDirectory = path.join(process.cwd(), 'migrations');
const client = new Client(process.env.DATABASE_URL ? {
  connectionString: process.env.DATABASE_URL,
} : {
  host: process.env.POSTGRES_HOST || 'localhost',
  port: Number.parseInt(process.env.POSTGRES_PORT || '5432', 10),
  database: process.env.POSTGRES_DB || 'oxsig',
  user: process.env.POSTGRES_USER || 'oxsig',
  password: process.env.POSTGRES_PASSWORD || 'oxsig_secure_password',
});

await client.connect();
try {
  await client.query('SELECT pg_advisory_lock(hashtext($1))', ['oxsig_schema_migrations']);
  await client.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      filename TEXT PRIMARY KEY,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  const files = (await readdir(migrationsDirectory))
    .filter((name) => /^\d+.*\.sql$/.test(name))
    .sort();

  for (const filename of files) {
    const applied = await client.query(
      'SELECT 1 FROM schema_migrations WHERE filename = $1',
      [filename],
    );
    if (applied.rows.length > 0) continue;

    const sql = await readFile(path.join(migrationsDirectory, filename), 'utf8');
    await client.query('BEGIN');
    try {
      await client.query(sql);
      await client.query('INSERT INTO schema_migrations (filename) VALUES ($1)', [filename]);
      await client.query('COMMIT');
      console.log(`Applied ${filename}`);
    } catch (error) {
      await client.query('ROLLBACK');
      throw new Error(`Migration failed: ${filename}`, { cause: error });
    }
  }
} finally {
  await client.query('SELECT pg_advisory_unlock(hashtext($1))', ['oxsig_schema_migrations']).catch(() => undefined);
  await client.end();
}
