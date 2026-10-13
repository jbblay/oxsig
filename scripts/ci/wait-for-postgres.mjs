// Wait until PostgreSQL accepts an authenticated TCP connection for the CI URL.
// `pg_isready` over a Unix socket is not enough: the official Docker image
// answers during its init-phase restart before TCP is listening.
import pg from 'pg';

const url = process.env.OXSIG_CI_DATABASE_URL;
if (!url) {
  console.error('[wait-for-postgres] OXSIG_CI_DATABASE_URL is required');
  process.exit(1);
}

const deadline = Date.now() + 90_000;
let lastError = null;
let stableSuccesses = 0;
while (Date.now() < deadline) {
  const client = new pg.Client({ connectionString: url, connectionTimeoutMillis: 3000 });
  try {
    await client.connect();
    const { rows } = await client.query('SELECT current_database() AS db, version() AS version');
    stableSuccesses += 1;
    // Require two consecutive successes a second apart to ride out init restarts.
    if (stableSuccesses >= 2) {
      console.log(`[wait-for-postgres] ready: ${rows[0].db} — ${rows[0].version.split(',')[0]}`);
      await client.end();
      process.exit(0);
    }
  } catch (error) {
    stableSuccesses = 0;
    lastError = error;
  } finally {
    await client.end().catch(() => undefined);
  }
  await new Promise((resolve) => setTimeout(resolve, 1000));
}
console.error(`[wait-for-postgres] PostgreSQL not reachable: ${lastError?.message || 'timeout'}`);
process.exit(1);
