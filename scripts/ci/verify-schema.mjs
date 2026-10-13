// CI schema verification against a real, empty PostgreSQL database.
//
// 1. Replays every migration from scratch (catches broken/conflicting DDL).
// 2. Re-runs the migrator (must be a no-op: ledger + idempotency).
// 3. Runs the schema parity check used for production readiness.
// 4. Verifies ledger checksums equal migrations/checksums.json.
// 5. Asserts structural invariants (users FKs declare ON DELETE; drift-repaired
//    objects from migration 058 exist).
// 6. Executes real application SQL paths inside a rolled-back transaction:
//    Clerk user provisioning, Vault optimistic-concurrency update, identity
//    tombstones, and account deletion with collaboration invitations.
//
// Usage: OXSIG_CI_DATABASE_URL=postgresql://... node scripts/ci/verify-schema.mjs
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const root = fileURLToPath(new URL('../..', import.meta.url));
const url = process.env.OXSIG_CI_DATABASE_URL;
if (!url) {
  console.error('OXSIG_CI_DATABASE_URL is required (a disposable, empty database).');
  process.exit(1);
}

const failures = [];
const step = (message) => console.log(`[verify-schema] ${message}`);
const fail = (message) => {
  failures.push(message);
  console.error(`[verify-schema] FAIL: ${message}`);
};

function runNode(script) {
  const result = spawnSync(process.execPath, [script], {
    cwd: root,
    env: { ...process.env, DATABASE_URL: url },
    encoding: 'utf8',
  });
  if (result.stdout) process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);
  return result;
}

const client = new pg.Client({ connectionString: url });
await client.connect();

try {
  const existing = await client.query(`SELECT to_regclass('public.oxisg_schema_migrations') AS ledger`);
  if (existing.rows[0]?.ledger) {
    throw new Error('Target database is not empty; schema verification requires a fresh database.');
  }

  const manifest = JSON.parse(readFileSync(`${root}/migrations/checksums.json`, 'utf8')).migrations;
  const expectedCount = Object.keys(manifest).length;

  step('replaying all migrations on an empty database');
  const first = runNode('scripts/migrate.mjs');
  const appliedFirst = (first.stdout.match(/^applied /gm) || []).length;
  if (first.status !== 0) fail('initial migration replay failed');
  else if (appliedFirst !== expectedCount) fail(`expected ${expectedCount} migrations applied, saw ${appliedFirst}`);

  step('re-running the migrator (must be a no-op)');
  const second = runNode('scripts/migrate.mjs');
  if (second.status !== 0) fail('second migrator run failed');
  if (/^applied /m.test(second.stdout)) fail('second migrator run re-applied migrations');

  step('running schema parity check');
  if (runNode('scripts/schema-parity-check.mjs').status !== 0) fail('schema parity check reported drift');

  step('comparing ledger checksums with migrations/checksums.json');
  const ledger = await client.query('SELECT filename, checksum FROM oxisg_schema_migrations');
  for (const row of ledger.rows) {
    if (manifest[row.filename] !== row.checksum) fail(`ledger checksum mismatch for ${row.filename}`);
  }

  step('checking foreign keys that reference users');
  const noAction = await client.query(
    `SELECT con.conrelid::regclass::text AS table_name, con.conname
       FROM pg_constraint con
      WHERE con.contype = 'f'
        AND con.confrelid = 'public.users'::regclass
        AND con.confdeltype = 'a'
      ORDER BY 1, 2`
  );
  for (const row of noAction.rows) fail(`FK ${row.table_name}.${row.conname} → users has no ON DELETE action`);

  step('checking drift-repaired objects');
  const index = await client.query(
    `SELECT 1 FROM pg_indexes WHERE schemaname='public' AND indexname='idx_live_workspace_control_leases_one_active_controller'`
  );
  if (!index.rows[0]) fail('single-active-controller lease index is missing');

  step('exercising application SQL paths (rolled back)');
  await client.query('BEGIN');
  try {
    // Clerk provisioning: same statement shape as upsertClerkUser (partial unique index inference).
    const insertUser = `INSERT INTO users (
         clerk_user_id, email, email_verified, display_name, avatar_url,
         auth_provider, is_active, clerk_synced_at, last_login_at, last_seen_at
       )
       VALUES ($1, $2, true, $3, NULL, 'clerk', true, NOW(), NOW(), NOW())
       ON CONFLICT (clerk_user_id) WHERE clerk_user_id IS NOT NULL DO NOTHING
       RETURNING id`;
    const owner = (await client.query(insertUser, ['ci_owner', 'owner@example.test', 'Owner'])).rows[0].id;
    const invitee = (await client.query(insertUser, ['ci_invitee', 'invitee@example.test', 'Invitee'])).rows[0].id;
    const duplicate = await client.query(insertUser, ['ci_owner', 'owner@example.test', 'Owner']);
    if (duplicate.rowCount !== 0) fail('Clerk provisioning ON CONFLICT did not deduplicate');

    await client.query(
      `UPDATE users SET clerk_source_updated_at = NOW() WHERE id = $1`,
      [owner]
    );
    await client.query(
      `INSERT INTO clerk_identity_tombstones (clerk_user_id, source) VALUES ('ci_deleted', 'clerk_webhook')
       ON CONFLICT (clerk_user_id) DO NOTHING`
    );
    await client.query(
      `INSERT INTO clerk_webhook_deliveries (svix_id, event_type, clerk_user_id) VALUES ('msg_ci', 'user.created', 'ci_owner')`
    );

    // Vault optimistic concurrency: stale version updates nothing, current version increments.
    const item = (await client.query(
      `INSERT INTO vault_items (owner_id, kind, title) VALUES ($1, 'command', 'CI item') RETURNING id, version`,
      [owner]
    )).rows[0];
    const vaultUpdate = `UPDATE vault_items SET title = $4, version = version + 1, updated_at = NOW()
                          WHERE id = $1 AND owner_id = $2 AND version = $3 RETURNING version`;
    const stale = await client.query(vaultUpdate, [item.id, owner, Number(item.version) + 5, 'stale']);
    if (stale.rowCount !== 0) fail('Vault update with a stale version modified the row');
    const fresh = await client.query(vaultUpdate, [item.id, owner, Number(item.version), 'fresh']);
    if (Number(fresh.rows[0]?.version) !== Number(item.version) + 1) fail('Vault update did not increment version');
    const otherOwner = await client.query(vaultUpdate, [item.id, invitee, Number(item.version) + 1, 'takeover']);
    if (otherOwner.rowCount !== 0) fail('Vault update ignored the ownership guard');

    // Account deletion must not require hand-written FK patch-ups (migration 058).
    const collaboration = (await client.query(
      `INSERT INTO collaborations (name, owner_id) VALUES ('CI space', $1) RETURNING id`,
      [invitee]
    )).rows[0].id;
    await client.query(
      `INSERT INTO collaboration_members (collaboration_id, user_id, invited_by) VALUES ($1, $2, $3)`,
      [collaboration, invitee, owner]
    );
    await client.query('SAVEPOINT delete_owner');
    try {
      await client.query('DELETE FROM users WHERE id = $1', [owner]);
      const member = await client.query(
        'SELECT invited_by FROM collaboration_members WHERE collaboration_id = $1',
        [collaboration]
      );
      if (member.rows[0]?.invited_by !== null) fail('deleting an inviting user did not null invited_by');
      const vaultLeft = await client.query('SELECT 1 FROM vault_items WHERE owner_id = $1', [owner]);
      if (vaultLeft.rowCount !== 0) fail('deleting a user left owned Vault items behind');
    } catch (error) {
      await client.query('ROLLBACK TO SAVEPOINT delete_owner');
      fail(`deleting a user with collaboration invitations failed: ${error.message}`);
    }
  } finally {
    await client.query('ROLLBACK');
  }
} catch (error) {
  fail(error instanceof Error ? error.message : String(error));
} finally {
  await client.end().catch(() => undefined);
}

if (failures.length) {
  console.error(`[verify-schema] ${failures.length} failure(s)`);
  process.exit(1);
}
step('all schema verification checks passed');
