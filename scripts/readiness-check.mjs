import { readFile } from 'node:fs/promises';
import process from 'node:process';
import { EC2Client, DescribeSecurityGroupsCommand, DescribeSubnetsCommand } from '@aws-sdk/client-ec2';
import { HeadBucketCommand, S3Client } from '@aws-sdk/client-s3';
import pg from 'pg';

const { Pool } = pg;
const args = new Set(process.argv.slice(2));
const jsonOutput = args.has('--json');
const strict = args.has('--strict');
const originalEnv = new Set(Object.keys(process.env));

function parseEnvValue(raw) {
  const value = raw.trim();
  if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
    return value.slice(1, -1);
  }
  const hash = value.indexOf(' #');
  return hash >= 0 ? value.slice(0, hash).trim() : value;
}

async function loadEnvFile(path, { overrideLoaded = false } = {}) {
  let content;
  try {
    content = await readFile(path, 'utf8');
  } catch (error) {
    if (error?.code === 'ENOENT') return;
    throw error;
  }

  for (const line of content.split(/\r?\n/)) {
    const match = line.match(/^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
    if (!match) continue;
    const [, name, raw] = match;
    if (originalEnv.has(name)) continue;
    if (!overrideLoaded && process.env[name] !== undefined) continue;
    process.env[name] = parseEnvValue(raw);
  }
}

await loadEnvFile('.env');
await loadEnvFile('.env.local', { overrideLoaded: true });

function env(name) {
  return String(process.env[name] || '').trim();
}

function all(...names) {
  return names.every((name) => Boolean(env(name)));
}

function validHttpUrl(value) {
  if (!value) return false;
  try {
    const parsed = new URL(value);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

const results = [];
function record(name, status, detail, { critical = false } = {}) {
  results.push({ name, status, detail, critical });
}

async function withTimeout(promise, ms, label) {
  let timer;
  try {
    return await Promise.race([
      promise,
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

async function checkDatabase() {
  const url = env('DATABASE_URL');
  if (!url) {
    record('Database', 'CONFIGURATION_REQUIRED', 'DATABASE_URL is not configured.', { critical: true });
    return null;
  }

  const pool = new Pool({ connectionString: url, max: 1, connectionTimeoutMillis: 5000 });
  try {
    await withTimeout(pool.query('SELECT 1'), 6000, 'Database connection');
    record('Database', 'READY', 'PostgreSQL accepted a live query.', { critical: true });
    return pool;
  } catch (error) {
    record('Database', 'UNREACHABLE', error instanceof Error ? error.message : 'PostgreSQL connection failed.', { critical: true });
    await pool.end().catch(() => undefined);
    return null;
  }
}

function checkClerk() {
  if (!all('NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY', 'CLERK_SECRET_KEY')) {
    record('Clerk auth', 'CONFIGURATION_REQUIRED', 'Set NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY and CLERK_SECRET_KEY.', { critical: true });
    return;
  }
  record('Clerk auth', 'READY', 'Application identity keys are configured.', { critical: true });
  if (env('CLERK_WEBHOOK_SIGNING_SECRET')) {
    record('Clerk webhook', 'READY', 'Webhook signing secret is configured.');
  } else {
    record('Clerk webhook', 'CONFIGURATION_REQUIRED', 'Set CLERK_WEBHOOK_SIGNING_SECRET before relying on production user-sync webhooks.');
  }
}

async function checkStorage() {
  const bucket = env('STORAGE_BUCKET');
  const region = env('STORAGE_REGION') || env('AWS_REGION');
  if (!bucket || !region) {
    record('AWS S3 storage', 'CONFIGURATION_REQUIRED', 'Set STORAGE_BUCKET and STORAGE_REGION.', { critical: true });
    return;
  }

  try {
    const client = new S3Client({ region });
    await withTimeout(client.send(new HeadBucketCommand({ Bucket: bucket })), 7000, 'S3 bucket check');
    record('AWS S3 storage', 'READY', `Bucket is reachable in configured region ${region}.`, { critical: true });
  } catch (error) {
    record('AWS S3 storage', 'UNREACHABLE', error instanceof Error ? error.message : 'S3 bucket check failed.', { critical: true });
  }
}

async function checkLabs() {
  if (env('LAB_AWS_ENABLED').toLowerCase() !== 'true') {
    record('AWS Labs', 'DISABLED', 'LAB_AWS_ENABLED is not true.');
    return false;
  }

  const region = env('LAB_AWS_REGION') || env('AWS_REGION');
  const subnet = env('LAB_AWS_SUBNET_ID');
  const securityGroup = env('LAB_AWS_SECURITY_GROUP_ID');
  if (!region || !subnet || !securityGroup) {
    record('AWS Labs', 'CONFIGURATION_REQUIRED', 'Set LAB_AWS_REGION, LAB_AWS_SUBNET_ID and LAB_AWS_SECURITY_GROUP_ID.', { critical: true });
    return false;
  }

  try {
    const client = new EC2Client({ region });
    await withTimeout(
      Promise.all([
        client.send(new DescribeSubnetsCommand({ SubnetIds: [subnet] })),
        client.send(new DescribeSecurityGroupsCommand({ GroupIds: [securityGroup] })),
      ]),
      8000,
      'AWS lab network check'
    );
    if (env('LAB_AWS_INSTANCE_PROFILE')) {
      record('AWS Labs', 'READY', `EC2 lab network is reachable in ${region}; SSM instance profile is configured.`, { critical: true });
      return true;
    }
    record('AWS Labs', 'DEGRADED', 'EC2 network is reachable, but LAB_AWS_INSTANCE_PROFILE is missing; browser terminal execution will not be ready.', { critical: true });
    return false;
  } catch (error) {
    record('AWS Labs', 'UNREACHABLE', error instanceof Error ? error.message : 'AWS lab runtime check failed.', { critical: true });
    return false;
  }
}

async function checkTerminal(databasePool, labsReady) {
  const secret = env('OXSIG_TERMINAL_BRIDGE_SECRET');
  if (!secret || secret.length < 32) {
    record('Terminal bridge', 'CONFIGURATION_REQUIRED', 'OXSIG_TERMINAL_BRIDGE_SECRET must contain at least 32 characters.', { critical: true });
    return;
  }
  if (!labsReady) {
    record('Terminal bridge', 'DEGRADED', 'Bridge secret is configured, but AWS Labs are not fully ready.', { critical: true });
    return;
  }
  if (!databasePool) {
    record('Terminal bridge', 'DEGRADED', 'Bridge secret is configured, but database readiness could not be verified.', { critical: true });
    return;
  }

  try {
    const table = await databasePool.query("SELECT to_regclass('public.terminal_bridge_ticket_uses') AS table_name");
    if (table.rows[0]?.table_name) {
      record('Terminal bridge', 'READY', 'Bridge secret, AWS Labs and shared replay-protection table are ready.', { critical: true });
    } else {
      record('Terminal bridge', 'DEGRADED', 'Database is reachable, but terminal_bridge_ticket_uses is missing; run pnpm db:migrate.', { critical: true });
    }
  } catch (error) {
    record('Terminal bridge', 'DEGRADED', error instanceof Error ? error.message : 'Terminal database readiness check failed.', { critical: true });
  }
}

function checkOpenAI() {
  record(
    'OpenAI',
    env('OPENAI_API_KEY') ? 'READY' : 'CONFIGURATION_REQUIRED',
    env('OPENAI_API_KEY') ? `API key is configured${env('OXSIG_AI_MODEL') ? `; model override ${env('OXSIG_AI_MODEL')}.` : '.'}` : 'Set OPENAI_API_KEY to enable AI Practitioner and Academy AI.'
  );
}

function checkEmail() {
  if (!env('RESEND_API_KEY') && !env('EMAIL_FROM') && !env('OXSIG_APP_URL')) {
    record('Resend email', 'CONFIGURATION_REQUIRED', 'Set RESEND_API_KEY, EMAIL_FROM and OXSIG_APP_URL to deliver external invitations.');
    return;
  }
  if (!all('RESEND_API_KEY', 'EMAIL_FROM', 'OXSIG_APP_URL') || !validHttpUrl(env('OXSIG_APP_URL'))) {
    record('Resend email', 'DEGRADED', 'Transactional email configuration is partial or OXSIG_APP_URL is invalid.');
    return;
  }
  record('Resend email', 'READY', 'Transactional email configuration is complete.');
}

function checkRealtime() {
  const key = env('ABLY_API_KEY');
  if (!key) {
    record('Ably realtime', 'CONFIGURATION_REQUIRED', 'ABLY_API_KEY is not configured; collaboration will use polling fallback.');
  } else if (!key.includes(':') || !key.includes('.')) {
    record('Ably realtime', 'DEGRADED', 'ABLY_API_KEY does not match the expected key shape.');
  } else {
    record('Ably realtime', 'READY', 'Realtime provider key is configured.');
  }
}

function checkSentry() {
  const serverDsn = env('SENTRY_DSN');
  const browserDsn = env('NEXT_PUBLIC_SENTRY_DSN');
  if (!serverDsn && !browserDsn) {
    record('Sentry', 'CONFIGURATION_REQUIRED', 'Set SENTRY_DSN and NEXT_PUBLIC_SENTRY_DSN for centralized runtime monitoring.');
    return;
  }
  if ((serverDsn && !validHttpUrl(serverDsn)) || (browserDsn && !validHttpUrl(browserDsn))) {
    record('Sentry', 'DEGRADED', 'One or more configured Sentry DSNs are invalid URLs.');
    return;
  }
  const sourceMap = ['SENTRY_AUTH_TOKEN', 'SENTRY_ORG', 'SENTRY_PROJECT'].filter((name) => env(name)).length;
  if (!serverDsn || !browserDsn || (sourceMap > 0 && sourceMap < 3)) {
    record('Sentry', 'DEGRADED', 'Core monitoring is partially configured; server/browser DSNs and source-map settings should be completed together.');
    return;
  }
  record('Sentry', 'READY', sourceMap === 3 ? 'Server/browser monitoring and production source-map upload configuration are complete.' : 'Server/browser monitoring is configured; source-map upload remains optional.');
}

function checkPostHog() {
  const token = env('POSTHOG_PROJECT_TOKEN');
  const host = env('POSTHOG_HOST');
  if (!token && !host) {
    record('PostHog', 'CONFIGURATION_REQUIRED', 'Set POSTHOG_PROJECT_TOKEN and POSTHOG_HOST to collect allow-listed product analytics.');
    return;
  }
  if (!token || !validHttpUrl(host)) {
    record('PostHog', 'DEGRADED', 'Product analytics configuration is partial or POSTHOG_HOST is invalid.');
    return;
  }
  record('PostHog', 'READY', 'Server-side product analytics configuration is complete.');
}

async function checkScheduler() {
  const secret = env('CRON_SECRET');
  let cronConfigured = false;
  try {
    const config = JSON.parse(await readFile('vercel.json', 'utf8'));
    cronConfigured = Array.isArray(config?.crons) && config.crons.some((item) => item?.path === '/api/internal/labs/cleanup');
  } catch {
    cronConfigured = false;
  }

  if (!secret || secret.length < 24) {
    record('Scheduler', 'CONFIGURATION_REQUIRED', 'CRON_SECRET must contain at least 24 characters.');
  } else if (!cronConfigured) {
    record('Scheduler', 'DEGRADED', 'CRON_SECRET is configured, but no Vercel cleanup schedule was found.');
  } else {
    record('Scheduler', 'READY', 'Protected cleanup endpoint secret and Vercel schedule are configured.');
  }
}

async function checkDependencyLock() {
  try {
    const lock = await readFile('pnpm-lock.yaml', 'utf8');
    record('Dependency lock', lock.includes("lockfileVersion: '9.0'") ? 'READY' : 'DEGRADED', 'pnpm-lock.yaml is committed and available for frozen installs.', { critical: true });
  } catch {
    record('Dependency lock', 'CONFIGURATION_REQUIRED', 'pnpm-lock.yaml is missing.', { critical: true });
  }
}

function checkOptionalLimits() {
  const raw = env('COLLAB_MAX_ATTACHMENT_BYTES');
  if (!raw) return;
  const value = Number(raw);
  if (!Number.isFinite(value) || value <= 0 || value > 5 * 1024 * 1024 * 1024) {
    record('Collaboration upload limit', 'DEGRADED', 'COLLAB_MAX_ATTACHMENT_BYTES must be a positive number no greater than 5 GiB.');
  } else {
    record('Collaboration upload limit', 'READY', `Custom collaboration attachment limit is ${Math.trunc(value)} bytes.`);
  }
}

const databasePool = await checkDatabase();
checkClerk();
await checkStorage();
const labsReady = await checkLabs();
await checkTerminal(databasePool, labsReady);
checkOpenAI();
checkEmail();
checkRealtime();
checkSentry();
checkPostHog();
await checkScheduler();
await checkDependencyLock();
checkOptionalLimits();

if (databasePool) await databasePool.end().catch(() => undefined);

const summary = {
  ready: results.filter((item) => item.status === 'READY').length,
  configurationRequired: results.filter((item) => item.status === 'CONFIGURATION_REQUIRED').length,
  disabled: results.filter((item) => item.status === 'DISABLED').length,
  degraded: results.filter((item) => item.status === 'DEGRADED').length,
  unreachable: results.filter((item) => item.status === 'UNREACHABLE').length,
};

if (jsonOutput) {
  console.log(JSON.stringify({ timestamp: new Date().toISOString(), summary, checks: results }, null, 2));
} else {
  console.log('\nOXSIG production readiness\n');
  const width = Math.max(...results.map((item) => item.name.length), 12);
  for (const item of results) {
    console.log(`${item.name.padEnd(width)}  ${item.status.padEnd(22)}  ${item.detail}`);
  }
  console.log(`\nReady ${summary.ready} | Config required ${summary.configurationRequired} | Disabled ${summary.disabled} | Degraded ${summary.degraded} | Unreachable ${summary.unreachable}\n`);
  console.log('This command never prints credential values. Provider configuration marked READY is shape/configuration validation unless the detail explicitly says a live check was performed.\n');
}

const criticalFailure = results.some((item) => item.critical && ['CONFIGURATION_REQUIRED', 'DEGRADED', 'UNREACHABLE'].includes(item.status));
if (strict && criticalFailure) process.exit(1);
