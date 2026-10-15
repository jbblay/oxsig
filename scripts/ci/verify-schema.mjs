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
import { compareSnapshots, snapshotDatabase } from '../aws/db-compare-lib.mjs';

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

  step('exercising the Neon -> RDS copy verifier against real PostgreSQL');
  const snapshotA = await snapshotDatabase(client);
  const snapshotB = await snapshotDatabase(client);
  const selfCompare = compareSnapshots(snapshotA, snapshotB);
  if (!selfCompare.ok || selfCompare.tablesCompared === 0) fail(`db-compare self-check failed: ${selfCompare.problems.join('; ')}`);
  if (Object.keys(snapshotA.ledger).length !== expectedCount) fail('db-compare did not read the full migration ledger');

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

    // Mentor foundation (migration 061): database-enforced invariants.
    const applicant = (await client.query(insertUser, ['ci_mentor_applicant', 'applicant@example.test', 'Applicant'])).rows[0].id;
    const reviewer = (await client.query(insertUser, ['ci_mentor_reviewer', 'reviewer@example.test', 'Reviewer'])).rows[0].id;
    const insertApplication = `INSERT INTO mentor_applications (
         applicant_id, track, headline, bio, specializations, motivation, timezone,
         code_of_conduct_version, code_of_conduct_accepted_at
       ) VALUES ($1, 'external', 'Network engineer and coach', repeat('b', 90), ARRAY['networking-dns'],
                 repeat('m', 50), 'Europe/London', '2026-10', NOW())
       RETURNING id`;
    const expectViolation = async (label, sql, params, sqlstate) => {
      await client.query('SAVEPOINT mentor_expect');
      try {
        await client.query(sql, params);
        fail(`mentor schema accepted ${label}`);
      } catch (error) {
        if (error.code !== sqlstate) fail(`mentor schema rejected ${label} with ${error.code}, expected ${sqlstate}`);
      } finally {
        await client.query('ROLLBACK TO SAVEPOINT mentor_expect');
      }
    };
    const applicationId = (await client.query(insertApplication, [applicant])).rows[0].id;
    await expectViolation('a second open application', insertApplication, [applicant], '23505');
    await expectViolation(
      'an approval without a decision timestamp',
      `UPDATE mentor_applications SET status='approved' WHERE id=$1`,
      [applicationId],
      '23514'
    );
    await expectViolation(
      'a non-https profile link',
      `UPDATE mentor_applications SET profile_url='http://example.test' WHERE id=$1`,
      [applicationId],
      '23514'
    );
    await client.query(
      `UPDATE mentor_applications SET status='approved', decided_by=$2, decided_at=NOW() WHERE id=$1`,
      [applicationId, reviewer]
    );
    await client.query(
      `INSERT INTO mentor_application_events (application_id, applicant_id, actor_id, actor_kind, from_status, to_status)
       VALUES ($1, $2, $3, 'admin', 'submitted', 'approved')`,
      [applicationId, applicant, reviewer]
    );
    await client.query(
      `INSERT INTO mentor_profiles (user_id, application_id, track, tier, headline, bio, timezone, approved_by)
       VALUES ($1, $2, 'external', 'verified_mentor', 'Network engineer and coach', 'bio', 'Europe/London', $3)`,
      [applicant, applicationId, reviewer]
    );
    const insertQualification = `INSERT INTO mentor_qualifications (mentor_id, specialization_id, basis, granted_by)
       VALUES ($1, 'networking-dns', 'professional_review', $2) RETURNING id`;
    const qualificationId = (await client.query(insertQualification, [applicant, reviewer])).rows[0].id;
    await expectViolation('a duplicate active qualification', insertQualification, [applicant, reviewer], '23505');
    await expectViolation(
      'a mentor tier outside the ladder',
      `UPDATE mentor_profiles SET tier='xp_legend' WHERE user_id=$1`,
      [applicant],
      '23514'
    );
    await client.query(
      `UPDATE mentor_qualifications SET status='revoked', revoked_at=NOW(), revoked_by=$2 WHERE id=$1`,
      [qualificationId, reviewer]
    );
    await client.query(insertQualification, [applicant, reviewer]);
    // A newly opened application is allowed once the previous one is closed.
    const reapplied = (await client.query(insertApplication, [applicant])).rows[0].id;
    await client.query(`UPDATE mentor_applications SET status='withdrawn' WHERE id=$1`, [reapplied]);

    // Free mentorship (migration 062): payments impossible, booking backstops.
    await expectViolation(
      'a paid session offering',
      `INSERT INTO mentor_session_offerings (mentor_id, kind, title, duration_minutes, price_cents, specialization_ids)
       VALUES ($1, 'quick_help', 'Paid help', 15, 500, ARRAY['networking-dns'])`,
      [applicant],
      '23514'
    );
    const offeringId = (await client.query(
      `INSERT INTO mentor_session_offerings (mentor_id, kind, title, duration_minutes, specialization_ids)
       VALUES ($1, 'guided_coaching', 'DNS coaching', 30, ARRAY['networking-dns']) RETURNING id`,
      [applicant]
    )).rows[0].id;
    const insertSession = `INSERT INTO mentorship_sessions (
         learner_id, mentor_id, offering_id, kind, duration_minutes, specialization_id, starts_at, ends_at,
         learner_timezone, topic, learner_goal, status, confirmed_at
       ) VALUES ($1, $2, $3, 'guided_coaching', 30, 'networking-dns', $4::timestamptz, $5::timestamptz,
                 'UTC', 'DNS lookups fail', 'Understand why resolution fails', $6, $7)
       RETURNING id`;
    const slot = new Date(Date.now() + 2 * 86_400_000);
    slot.setUTCMinutes(0, 0, 0);
    const slotEnd = new Date(slot.getTime() + 30 * 60_000);
    await client.query(insertSession, [invitee, applicant, offeringId, slot, slotEnd, 'requested', null]);
    await expectViolation('a double booking of the same mentor slot', insertSession, [reviewer, applicant, offeringId, slot, slotEnd, 'requested', null], '23505');
    await expectViolation('a session whose end does not match its duration', insertSession,
      [reviewer, applicant, offeringId, new Date(slot.getTime() + 7_200_000), new Date(slot.getTime() + 7_200_000 + 45 * 60_000), 'requested', null], '23514');
    await expectViolation('a session with oneself', insertSession, [applicant, applicant, offeringId, new Date(slot.getTime() + 86_400_000), new Date(slotEnd.getTime() + 86_400_000), 'requested', null], '23514');
    await expectViolation('a confirmation without a timestamp', insertSession,
      [reviewer, applicant, offeringId, new Date(slot.getTime() + 3_600_000), new Date(slotEnd.getTime() + 3_600_000), 'confirmed', null], '23514');
    const overlapping = await client.query(
      `SELECT starts_at FROM mentorship_sessions
        WHERE (mentor_id = ANY($1::uuid[]) OR learner_id = ANY($1::uuid[]))
          AND status IN ('requested','confirmed')
          AND tstzrange(starts_at, ends_at, '[)') && tstzrange($2::timestamptz, $3::timestamptz, '[)')`,
      [[applicant], new Date(slot.getTime() + 15 * 60_000), new Date(slot.getTime() + 45 * 60_000)]
    );
    if (overlapping.rowCount !== 1) fail('mentorship overlap query did not find the overlapping booking');
    const adjacent = await client.query(
      `SELECT 1 FROM mentorship_sessions
        WHERE mentor_id = $1 AND tstzrange(starts_at, ends_at, '[)') && tstzrange($2::timestamptz, $3::timestamptz, '[)')`,
      [applicant, slotEnd, new Date(slotEnd.getTime() + 30 * 60_000)]
    );
    if (adjacent.rowCount !== 0) fail('back-to-back mentorship sessions were treated as overlapping');
    const roomColumn = await client.query(
      `SELECT 1 FROM information_schema.columns WHERE table_name='live_workspaces' AND column_name='expires_at'`
    );
    if (!roomColumn.rows[0]) fail('live_workspaces.expires_at is missing');

    await client.query('DELETE FROM mentor_session_offerings WHERE mentor_id = $1', [applicant]);
    await client.query('DELETE FROM users WHERE id = $1', [reviewer]);
    const afterReviewer = await client.query(
      `SELECT application.decided_by, profile.approved_by,
              (SELECT COUNT(*)::int FROM mentor_qualifications WHERE mentor_id=$1 AND granted_by IS NOT NULL) AS attributed
         FROM mentor_applications application
         JOIN mentor_profiles profile ON profile.user_id=application.applicant_id
        WHERE application.id=$2`,
      [applicant, applicationId]
    );
    const reviewerRow = afterReviewer.rows[0];
    if (!reviewerRow || reviewerRow.decided_by !== null || reviewerRow.approved_by !== null || reviewerRow.attributed !== 0) {
      fail('deleting a reviewer did not keep mentor decisions with a nulled reviewer reference');
    }
    await client.query('DELETE FROM users WHERE id = $1', [applicant]);
    const mentorLeft = await client.query(
      `SELECT (SELECT COUNT(*) FROM mentor_applications WHERE applicant_id=$1)
            + (SELECT COUNT(*) FROM mentor_application_events WHERE applicant_id=$1)
            + (SELECT COUNT(*) FROM mentor_profiles WHERE user_id=$1)
            + (SELECT COUNT(*) FROM mentor_qualifications WHERE mentor_id=$1) AS remaining`,
      [applicant]
    );
    if (Number(mentorLeft.rows[0].remaining) !== 0) fail('deleting a mentor account left mentor rows behind');
    const learnerHistory = await client.query(
      `SELECT mentor_id, offering_id FROM mentorship_sessions WHERE learner_id=$1`,
      [invitee]
    );
    if (learnerHistory.rowCount !== 1 || learnerHistory.rows[0].mentor_id !== null || learnerHistory.rows[0].offering_id !== null) {
      fail('deleting a mentor account did not keep the learner session history with a nulled mentor');
    }

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
