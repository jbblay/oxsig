import 'server-only';

import type { Pool } from 'pg';
import { founderEmails, isFounderIdentity } from '@/lib/auth/platform-role';
import type {
  AdminAuditEvent,
  AdminOverview,
  AdminResource,
  AdminResourceFilter,
  AdminSeriesPoint,
  AdminSystemStatus,
  AdminUserDetail,
  AdminUserFilter,
  AdminUserList,
  AdminUserSort,
  AdminUserStatus,
  AdminUserSummary,
} from './contract';

const LIVE_STATUSES = `('destroyed','failed')`;

const USER_SUMMARY_COLUMNS = `
  u.id, u.email, u.display_name, u.avatar_url, u.role, u.email_verified, u.is_active,
  u.suspended_at, u.suspended_reason, u.created_at, u.last_seen_at, u.onboarded_at,
  (SELECT COUNT(*) FROM lab_instances li WHERE li.owner_id=u.id AND li.status NOT IN ${LIVE_STATUSES})::int
    + (SELECT COUNT(*) FROM operation_runs r WHERE r.owner_id=u.id AND r.status NOT IN ${LIVE_STATUSES})::int AS live_resources,
  (SELECT COUNT(*) FROM lab_instances li WHERE li.owner_id=u.id)::int AS total_labs`;

function iso(value: unknown): string | null {
  if (!value) return null;
  return value instanceof Date ? value.toISOString() : String(value);
}

function num(value: unknown) {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function userStatus(row: Record<string, any>): AdminUserStatus {
  if (row.is_active === false) return 'deactivated';
  if (row.suspended_at) return 'suspended';
  return 'active';
}

export function mapAdminUser(row: Record<string, any>, emails = founderEmails()): AdminUserSummary {
  const founder = isFounderIdentity(row, emails);
  return {
    id: row.id,
    email: row.email ?? null,
    displayName: row.display_name || row.email?.split('@')[0] || 'Unnamed operator',
    avatarUrl: row.avatar_url || null,
    role: row.role === 'admin' || founder ? 'admin' : 'user',
    isFounder: founder,
    emailVerified: Boolean(row.email_verified),
    status: userStatus(row),
    suspendedReason: row.suspended_reason ?? null,
    createdAt: iso(row.created_at) ?? new Date(0).toISOString(),
    lastSeenAt: iso(row.last_seen_at),
    onboardedAt: iso(row.onboarded_at),
    liveResources: num(row.live_resources),
    totalLabs: num(row.total_labs),
  };
}

function mapAudit(row: Record<string, any>): AdminAuditEvent {
  return {
    id: row.id,
    action: row.action,
    actorId: row.user_id ?? null,
    actorEmail: row.actor_email ?? null,
    actorName: row.actor_name ?? null,
    resourceType: row.resource_type ?? null,
    resourceId: row.resource_id ?? null,
    ipAddress: row.ip_address ?? null,
    metadata: row.metadata ?? null,
    createdAt: iso(row.created_at)!,
  };
}

function mapResource(row: Record<string, any>): AdminResource {
  return {
    kind: row.kind,
    id: row.id,
    name: row.name || 'Untitled',
    status: row.status,
    ownerId: row.owner_id,
    ownerEmail: row.owner_email ?? null,
    ownerName: row.owner_name ?? null,
    provider: row.provider ?? null,
    createdAt: iso(row.created_at)!,
    startedAt: iso(row.started_at),
    expiresAt: iso(row.expires_at),
    lastError: row.last_error ?? null,
    partOfOperation: Boolean(row.part_of_operation),
  };
}

function series(rows: Array<Record<string, any>>): AdminSeriesPoint[] {
  return rows.map((row) => ({ date: iso(row.day)!.slice(0, 10), value: num(row.value) }));
}

function dailySeriesSql(source: string) {
  return `
    WITH days AS (SELECT generate_series(date_trunc('day', NOW()) - INTERVAL '29 days', date_trunc('day', NOW()), INTERVAL '1 day') AS day)
    SELECT days.day, COALESCE(s.value, 0)::int AS value
      FROM days
      LEFT JOIN (${source}) s ON s.day = days.day
     ORDER BY days.day ASC`;
}

async function relationExists(pool: Pool, relation: string) {
  const result = await pool.query(`SELECT to_regclass($1) AS name`, [`public.${relation}`]);
  return Boolean(result.rows[0]?.name);
}

const RESOURCE_UNION = `
  SELECT 'lab'::text AS kind, li.id, COALESCE(ld.name, li.metadata->>'name', 'Cyber lab') AS name, li.status,
         li.owner_id, li.runtime_provider AS provider, li.created_at, li.started_at, li.expires_at, li.last_error,
         (li.metadata ? 'operationRunId') AS part_of_operation
    FROM lab_instances li
    LEFT JOIN lab_definitions ld ON ld.id = li.definition_id
  UNION ALL
  SELECT 'operation'::text AS kind, r.id, r.operation_slug AS name, r.status,
         r.owner_id, r.mode AS provider, r.created_at, r.created_at AS started_at, r.expires_at, r.last_error,
         false AS part_of_operation
    FROM operation_runs r`;

export async function getAdminOverview(pool: Pool): Promise<AdminOverview> {
  const emails = founderEmails();
  const hasActivityDays = await relationExists(pool, 'learning_activity_days');

  const [users, labs, operations, backlog, signups, activeUsers, labLaunches, recentUsers, recentEvents] = await Promise.all([
    pool.query(
      `SELECT
         COUNT(*)::int AS total,
         COUNT(*) FILTER (WHERE created_at > NOW() - INTERVAL '7 days')::int AS new7d,
         COUNT(*) FILTER (WHERE created_at > NOW() - INTERVAL '30 days')::int AS new30d,
         COUNT(*) FILTER (WHERE last_seen_at > NOW() - INTERVAL '24 hours')::int AS active24h,
         COUNT(*) FILTER (WHERE last_seen_at > NOW() - INTERVAL '7 days')::int AS active7d,
         COUNT(*) FILTER (WHERE last_seen_at > NOW() - INTERVAL '30 days')::int AS active30d,
         COUNT(*) FILTER (WHERE suspended_at IS NOT NULL)::int AS suspended,
         COUNT(*) FILTER (WHERE role='admin' OR (email_verified AND LOWER(email) = ANY($1::text[])))::int AS admins,
         COUNT(*) FILTER (WHERE onboarded_at IS NULL)::int AS onboarding_pending
       FROM users WHERE is_active = true`,
      [emails]
    ),
    pool.query(
      `SELECT status, COUNT(*)::int AS count,
              COUNT(*) FILTER (WHERE created_at > NOW() - INTERVAL '30 days')::int AS launched30d,
              COUNT(*) FILTER (WHERE status='failed' AND updated_at > NOW() - INTERVAL '24 hours')::int AS failed24h,
              COALESCE(SUM(EXTRACT(EPOCH FROM (COALESCE(stopped_at, NOW()) - started_at)) / 60)
                FILTER (WHERE started_at > NOW() - INTERVAL '30 days'), 0)::int AS runtime_minutes
         FROM lab_instances GROUP BY status`
    ),
    pool.query(
      `SELECT status, COUNT(*)::int AS count,
              COUNT(*) FILTER (WHERE created_at > NOW() - INTERVAL '30 days')::int AS launched30d,
              COUNT(*) FILTER (WHERE status='failed' AND updated_at > NOW() - INTERVAL '24 hours')::int AS failed24h
         FROM operation_runs GROUP BY status`
    ),
    pool.query(
      `SELECT
         (SELECT COUNT(*) FROM lab_instances WHERE expires_at <= NOW() AND status NOT IN ${LIVE_STATUSES})::int
       + (SELECT COUNT(*) FROM operation_runs WHERE expires_at <= NOW() AND status NOT IN ${LIVE_STATUSES})::int AS count`
    ),
    pool.query(dailySeriesSql(`SELECT date_trunc('day', created_at) AS day, COUNT(*) AS value FROM users GROUP BY 1`)),
    hasActivityDays
      ? pool.query(dailySeriesSql(`SELECT activity_date::timestamptz AS day, COUNT(DISTINCT owner_id) AS value FROM learning_activity_days WHERE activity_date > CURRENT_DATE - 30 GROUP BY 1`))
      : Promise.resolve({ rows: [] }),
    pool.query(dailySeriesSql(`SELECT date_trunc('day', created_at) AS day, COUNT(*) AS value FROM lab_instances GROUP BY 1`)),
    pool.query(`SELECT ${USER_SUMMARY_COLUMNS} FROM users u ORDER BY u.created_at DESC LIMIT 6`),
    pool.query(
      `SELECT a.*, u.email AS actor_email, u.display_name AS actor_name
         FROM audit_logs a LEFT JOIN users u ON u.id = a.user_id
        ORDER BY a.created_at DESC LIMIT 8`
    ),
  ]);

  const labByStatus: Record<string, number> = {};
  let labLive = 0, labFailed24h = 0, labLaunched30d = 0, runtimeMinutes = 0;
  for (const row of labs.rows) {
    labByStatus[row.status] = num(row.count);
    if (!['destroyed', 'failed'].includes(row.status)) labLive += num(row.count);
    labFailed24h += num(row.failed24h);
    labLaunched30d += num(row.launched30d);
    runtimeMinutes += num(row.runtime_minutes);
  }

  const opByStatus: Record<string, number> = {};
  let opLive = 0, opFailed24h = 0, opLaunched30d = 0;
  for (const row of operations.rows) {
    opByStatus[row.status] = num(row.count);
    if (!['destroyed', 'failed'].includes(row.status)) opLive += num(row.count);
    opFailed24h += num(row.failed24h);
    opLaunched30d += num(row.launched30d);
  }

  const u = users.rows[0] ?? {};
  return {
    generatedAt: new Date().toISOString(),
    users: {
      total: num(u.total),
      new7d: num(u.new7d),
      new30d: num(u.new30d),
      active24h: num(u.active24h),
      active7d: num(u.active7d),
      active30d: num(u.active30d),
      suspended: num(u.suspended),
      admins: num(u.admins),
      onboardingPending: num(u.onboarding_pending),
    },
    labs: { live: labLive, failed24h: labFailed24h, launched30d: labLaunched30d, runtimeMinutes30d: runtimeMinutes, byStatus: labByStatus },
    operations: { live: opLive, failed24h: opFailed24h, launched30d: opLaunched30d, byStatus: opByStatus },
    cleanupBacklog: num(backlog.rows[0]?.count),
    signups: series(signups.rows),
    activeUsers: series(activeUsers.rows),
    labLaunches: series(labLaunches.rows),
    recentUsers: recentUsers.rows.map((row) => mapAdminUser(row, emails)),
    recentEvents: recentEvents.rows.map(mapAudit),
  };
}

const USER_FILTER_SQL: Record<AdminUserFilter, string> = {
  all: 'TRUE',
  active: `u.is_active = true AND u.suspended_at IS NULL`,
  suspended: `u.suspended_at IS NOT NULL`,
  admins: `(u.role = 'admin' OR (u.email_verified AND LOWER(u.email) = ANY($1::text[])))`,
  new: `u.created_at > NOW() - INTERVAL '7 days'`,
  dormant: `u.is_active = true AND (u.last_seen_at IS NULL OR u.last_seen_at < NOW() - INTERVAL '30 days')`,
};

const USER_SORT_SQL: Record<AdminUserSort, string> = {
  newest: 'u.created_at DESC',
  oldest: 'u.created_at ASC',
  'recently-active': 'u.last_seen_at DESC NULLS LAST',
  name: `LOWER(COALESCE(u.display_name, u.email)) ASC`,
};

export async function listAdminUsers(
  pool: Pool,
  options: { q?: string; filter: AdminUserFilter; sort: AdminUserSort; limit: number; offset: number }
): Promise<AdminUserList> {
  const emails = founderEmails();
  const params: unknown[] = [emails];
  // $1 (founder emails) is always referenced so Postgres can type it for every filter.
  const where = ['cardinality($1::text[]) >= 0', USER_FILTER_SQL[options.filter]];
  if (options.q) {
    params.push(`%${options.q.replace(/[\\%_]/g, (char) => `\\${char}`)}%`);
    const p = `$${params.length}`;
    where.push(`(u.email ILIKE ${p} OR u.display_name ILIKE ${p} OR u.id::text ILIKE ${p})`);
  }
  const whereSql = where.join(' AND ');

  const [rows, total] = await Promise.all([
    pool.query(
      `SELECT ${USER_SUMMARY_COLUMNS} FROM users u WHERE ${whereSql}
        ORDER BY ${USER_SORT_SQL[options.sort]} LIMIT ${options.limit} OFFSET ${options.offset}`,
      params
    ),
    pool.query(`SELECT COUNT(*)::int AS count FROM users u WHERE ${whereSql}`, params),
  ]);

  return {
    users: rows.rows.map((row) => mapAdminUser(row, emails)),
    total: num(total.rows[0]?.count),
    limit: options.limit,
    offset: options.offset,
  };
}

export async function getAdminUserDetail(pool: Pool, userId: string): Promise<AdminUserDetail | null> {
  const emails = founderEmails();
  const user = await pool.query(
    `SELECT ${USER_SUMMARY_COLUMNS}, u.headline, u.bio, u.experience_level, u.focus_areas, u.auth_provider
       FROM users u WHERE u.id=$1 LIMIT 1`,
    [userId]
  );
  if (!user.rows[0]) return null;

  const [vault, collaborations, storyboards, activeDays, usage, resources, events] = await Promise.all([
    relationExists(pool, 'vault_items').then((exists) => exists ? pool.query(`SELECT COUNT(*)::int AS count FROM vault_items WHERE owner_id=$1`, [userId]) : { rows: [{ count: 0 }] }),
    pool.query(`SELECT COUNT(*)::int AS count FROM collaboration_members WHERE user_id=$1`, [userId]),
    pool.query(`SELECT COUNT(*)::int AS count FROM storyboard_sessions WHERE owner_id=$1 AND deleted_at IS NULL`, [userId]),
    relationExists(pool, 'learning_activity_days').then((exists) => exists
      ? pool.query(`SELECT COUNT(*)::int AS count FROM learning_activity_days WHERE owner_id=$1 AND activity_date > CURRENT_DATE - 30`, [userId])
      : { rows: [{ count: 0 }] }),
    pool.query(
      `SELECT
         (SELECT COUNT(*) FROM lab_instances WHERE owner_id=$1)::int AS labs,
         (SELECT COUNT(*) FROM operation_runs WHERE owner_id=$1)::int AS operations,
         (SELECT COALESCE(SUM(EXTRACT(EPOCH FROM (COALESCE(stopped_at, NOW()) - started_at)) / 60), 0)
            FROM lab_instances WHERE owner_id=$1 AND started_at IS NOT NULL)::int AS runtime_minutes`,
      [userId]
    ),
    pool.query(
      `SELECT res.*, NULL::text AS owner_email, NULL::text AS owner_name
         FROM (${RESOURCE_UNION}) res WHERE res.owner_id=$1
        ORDER BY (res.status NOT IN ${LIVE_STATUSES}) DESC, res.created_at DESC LIMIT 25`,
      [userId]
    ),
    pool.query(
      `SELECT a.*, NULL::text AS actor_email, NULL::text AS actor_name
         FROM audit_logs a
        WHERE a.user_id=$1 OR (a.resource_type='user' AND a.resource_id=$1::uuid)
        ORDER BY a.created_at DESC LIMIT 30`,
      [userId]
    ),
  ]);

  const row = user.rows[0];
  return {
    user: {
      ...mapAdminUser(row, emails),
      headline: row.headline ?? null,
      bio: row.bio ?? null,
      experienceLevel: row.experience_level ?? null,
      focusAreas: Array.isArray(row.focus_areas) ? row.focus_areas : [],
      suspendedAt: iso(row.suspended_at),
      authProvider: row.auth_provider ?? null,
    },
    usage: {
      labs: num(usage.rows[0]?.labs),
      operations: num(usage.rows[0]?.operations),
      runtimeMinutes: num(usage.rows[0]?.runtime_minutes),
      vaultItems: num(vault.rows[0]?.count),
      collaborations: num(collaborations.rows[0]?.count),
      storyboards: num(storyboards.rows[0]?.count),
      activeDays30d: num(activeDays.rows[0]?.count),
    },
    resources: resources.rows.map(mapResource),
    events: events.rows.map(mapAudit),
  };
}

const RESOURCE_FILTER_SQL: Record<AdminResourceFilter, string> = {
  live: `res.status NOT IN ${LIVE_STATUSES}`,
  failed: `res.status = 'failed'`,
  expired: `res.expires_at <= NOW() AND res.status NOT IN ${LIVE_STATUSES}`,
  all: 'TRUE',
};

export async function listAdminResources(pool: Pool, filter: AdminResourceFilter, limit = 100): Promise<AdminResource[]> {
  const result = await pool.query(
    `SELECT res.*, u.email AS owner_email, u.display_name AS owner_name
       FROM (${RESOURCE_UNION}) res
       LEFT JOIN users u ON u.id = res.owner_id
      WHERE ${RESOURCE_FILTER_SQL[filter]}
      ORDER BY res.created_at DESC
      LIMIT ${limit}`
  );
  return result.rows.map(mapResource);
}

export async function listAdminAudit(
  pool: Pool,
  options: { action?: string; userId?: string; before?: string; limit: number }
): Promise<{ events: AdminAuditEvent[]; nextCursor: string | null }> {
  const params: unknown[] = [];
  const where: string[] = [];
  if (options.action) {
    params.push(`${options.action.replace(/[\\%_]/g, (char) => `\\${char}`)}%`);
    where.push(`a.action LIKE $${params.length}`);
  }
  if (options.userId) {
    params.push(options.userId);
    where.push(`(a.user_id = $${params.length} OR (a.resource_type='user' AND a.resource_id = $${params.length}))`);
  }
  if (options.before) {
    params.push(options.before);
    where.push(`a.created_at < $${params.length}::timestamptz`);
  }

  const result = await pool.query(
    `SELECT a.*, u.email AS actor_email, u.display_name AS actor_name
       FROM audit_logs a LEFT JOIN users u ON u.id = a.user_id
      ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
      ORDER BY a.created_at DESC
      LIMIT ${options.limit + 1}`,
    params
  );
  const rows = result.rows.map(mapAudit);
  const hasMore = rows.length > options.limit;
  if (hasMore) rows.length = options.limit;
  return { events: rows, nextCursor: hasMore ? rows[rows.length - 1].createdAt : null };
}

const INTEGRATIONS: Array<{ id: string; label: string; keys: string[]; required: boolean; detail: string }> = [
  { id: 'clerk', label: 'Clerk identity', keys: ['NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY', 'CLERK_SECRET_KEY'], required: true, detail: 'Sign-in, sign-up and sessions' },
  { id: 'clerk-webhook', label: 'Clerk webhook', keys: ['CLERK_WEBHOOK_SIGNING_SECRET'], required: true, detail: 'Profile sync and account deletion' },
  { id: 'founders', label: 'Founder access', keys: ['OXSIG_FOUNDER_EMAILS'], required: false, detail: 'Bootstraps platform admins by verified email' },
  { id: 'database', label: 'Postgres', keys: ['DATABASE_URL'], required: true, detail: 'Primary datastore' },
  { id: 'storage', label: 'Object storage', keys: ['STORAGE_BUCKET'], required: true, detail: 'Uploads, attachments, board audio' },
  { id: 'aws-labs', label: 'AWS lab runtime', keys: ['LAB_AWS_REGION', 'LAB_AWS_SUBNET_ID', 'LAB_AWS_SECURITY_GROUP_ID'], required: true, detail: 'Disposable lab VMs' },
  { id: 'cron', label: 'Lifecycle cron', keys: ['CRON_SECRET'], required: true, detail: 'Expired lab and operation cleanup' },
  { id: 'terminal', label: 'Terminal bridge', keys: ['OXSIG_TERMINAL_BRIDGE_SECRET'], required: true, detail: 'Browser terminal sessions' },
  { id: 'realtime', label: 'Ably realtime', keys: ['ABLY_API_KEY'], required: false, detail: 'Live collaboration and presence' },
  { id: 'ai', label: 'AI provider', keys: ['OPENAI_API_KEY'], required: false, detail: 'AI Helper and Practitioner' },
  { id: 'email', label: 'Transactional email', keys: ['RESEND_API_KEY', 'EMAIL_FROM'], required: false, detail: 'Invitations and notices' },
  { id: 'sentry', label: 'Sentry', keys: ['SENTRY_DSN'], required: false, detail: 'Error monitoring' },
  { id: 'posthog', label: 'PostHog', keys: ['POSTHOG_PROJECT_TOKEN'], required: false, detail: 'Product analytics' },
];

export async function getAdminSystemStatus(pool: Pool): Promise<AdminSystemStatus> {
  let ok = false;
  let latencyMs: number | null = null;
  const started = performance.now();
  try {
    await pool.query('SELECT 1');
    ok = true;
    latencyMs = Math.round(performance.now() - started);
  } catch {
    ok = false;
  }

  const [migrations, adminColumns, lifecycle] = ok
    ? await Promise.all([
        pool.query(`SELECT COUNT(*)::int AS count, MAX(filename) AS latest, MAX(applied_at) AS latest_at FROM oxisg_schema_migrations`).catch(() => ({ rows: [] as any[] })),
        pool.query(`SELECT 1 FROM information_schema.columns WHERE table_name='users' AND column_name='suspended_at' LIMIT 1`),
        pool.query(
          `SELECT
             (SELECT COUNT(*) FROM lab_instances WHERE expires_at <= NOW() AND status NOT IN ${LIVE_STATUSES})::int
           + (SELECT COUNT(*) FROM operation_runs WHERE expires_at <= NOW() AND status NOT IN ${LIVE_STATUSES})::int AS backlog,
             (SELECT MAX(created_at) FROM lab_events WHERE source='scheduler') AS last_cleanup,
             (SELECT COUNT(*) FROM lab_instances WHERE status='failed' AND updated_at > NOW() - INTERVAL '24 hours')::int AS failed_labs,
             (SELECT COUNT(*) FROM operation_runs WHERE status='failed' AND updated_at > NOW() - INTERVAL '24 hours')::int AS failed_ops`
        ),
      ])
    : [{ rows: [] as any[] }, { rows: [] as any[] }, { rows: [] as any[] }];

  return {
    generatedAt: new Date().toISOString(),
    environment: {
      nodeEnv: process.env.NODE_ENV || 'development',
      vercelEnv: process.env.VERCEL_ENV || null,
      region: process.env.VERCEL_REGION || process.env.AWS_REGION || null,
      commit: process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) || null,
      branch: process.env.VERCEL_GIT_COMMIT_REF || null,
    },
    database: {
      ok,
      latencyMs,
      migrationsApplied: num(migrations.rows[0]?.count),
      latestMigration: migrations.rows[0]?.latest ?? null,
      latestMigrationAt: iso(migrations.rows[0]?.latest_at),
      pendingAdminMigration: ok && !adminColumns.rows[0],
    },
    integrations: INTEGRATIONS.map((integration) => ({
      id: integration.id,
      label: integration.label,
      required: integration.required,
      detail: integration.detail,
      configured: integration.keys.every((key) => Boolean(process.env[key]?.trim())),
    })),
    lifecycle: {
      cleanupBacklog: num(lifecycle.rows[0]?.backlog),
      lastCleanupAt: iso(lifecycle.rows[0]?.last_cleanup),
      failedLabs24h: num(lifecycle.rows[0]?.failed_labs),
      failedOperations24h: num(lifecycle.rows[0]?.failed_ops),
    },
  };
}
