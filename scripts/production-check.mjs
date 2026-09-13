import process from 'node:process';

const errors = [];
const warnings = [];

function value(name) {
  return String(process.env[name] || '').trim();
}

function requireValue(name, message = `${name} is required`) {
  if (!value(name)) errors.push(message);
}

function requirePattern(name, pattern, message) {
  const raw = value(name);
  if (raw && !pattern.test(raw)) errors.push(message);
}

function positiveNumber(name, { min = 0, max = Number.POSITIVE_INFINITY } = {}) {
  const raw = value(name);
  if (!raw) return;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed < min || parsed > max) {
    errors.push(`${name} must be a number between ${min} and ${max}`);
  }
}

function validateHttpUrl(name) {
  const raw = value(name);
  if (!raw) return;
  try {
    const parsed = new URL(raw);
    if (!['http:', 'https:'].includes(parsed.protocol)) {
      errors.push(`${name} must use http:// or https://`);
    }
  } catch {
    errors.push(`${name} is not a valid URL`);
  }
}

requireValue('NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY');
requireValue('CLERK_SECRET_KEY');
requireValue('DATABASE_URL');
requireValue('CRON_SECRET');
requireValue('STORAGE_BUCKET');
requireValue('STORAGE_REGION');
requireValue('OXSIG_TERMINAL_BRIDGE_SECRET');

const databaseUrl = value('DATABASE_URL');
if (databaseUrl) {
  try {
    const parsed = new URL(databaseUrl);
    if (!['postgres:', 'postgresql:'].includes(parsed.protocol)) {
      errors.push('DATABASE_URL must use the postgres:// or postgresql:// scheme');
    }
  } catch {
    errors.push('DATABASE_URL is not a valid URL');
  }
}

const bridgeSecret = value('OXSIG_TERMINAL_BRIDGE_SECRET');
if (bridgeSecret && bridgeSecret.length < 32) {
  errors.push('OXSIG_TERMINAL_BRIDGE_SECRET must contain at least 32 characters');
}

if (value('CRON_SECRET') && value('CRON_SECRET').length < 24) {
  errors.push('CRON_SECRET must contain at least 24 characters');
}

positiveNumber('STORAGE_MAX_UPLOAD_BYTES', { min: 1, max: 5 * 1024 * 1024 * 1024 });
positiveNumber('COLLAB_MAX_ATTACHMENT_BYTES', { min: 1, max: 5 * 1024 * 1024 * 1024 });
positiveNumber('STORYBOARD_MAX_AUDIO_BYTES', { min: 1, max: 512 * 1024 * 1024 });
positiveNumber('LAB_AWS_TTL_MINUTES', { min: 5, max: 1440 });

const labsEnabled = value('LAB_AWS_ENABLED').toLowerCase() === 'true';
if (labsEnabled) {
  requireValue('LAB_AWS_REGION', 'LAB_AWS_REGION is required when LAB_AWS_ENABLED=true');
  requireValue('LAB_AWS_SUBNET_ID', 'LAB_AWS_SUBNET_ID is required when LAB_AWS_ENABLED=true');
  requireValue('LAB_AWS_SECURITY_GROUP_ID', 'LAB_AWS_SECURITY_GROUP_ID is required when LAB_AWS_ENABLED=true');
  requireValue('LAB_AWS_INSTANCE_PROFILE', 'LAB_AWS_INSTANCE_PROFILE is required when LAB_AWS_ENABLED=true');
}

const preparedBlackDomainEnabled = value('LAB_AWS_BLACK_DOMAIN_PREPARED').toLowerCase() === 'true';
if (preparedBlackDomainEnabled) {
  if (!labsEnabled) {
    errors.push('LAB_AWS_ENABLED must be true when LAB_AWS_BLACK_DOMAIN_PREPARED=true');
  }
  const preparedKeys = [
    'LAB_AWS_BLACK_DOMAIN_SLOT_KEY',
    'LAB_AWS_BLACK_DOMAIN_DC_INSTANCE_ID',
    'LAB_AWS_BLACK_DOMAIN_WORKSTATION_INSTANCE_ID',
    'LAB_AWS_BLACK_DOMAIN_OPERATOR_INSTANCE_ID',
    'LAB_AWS_BLACK_DOMAIN_DC_SNAPSHOT_ID',
    'LAB_AWS_BLACK_DOMAIN_WORKSTATION_SNAPSHOT_ID',
    'LAB_AWS_BLACK_DOMAIN_OPERATOR_SNAPSHOT_ID',
    'LAB_AWS_BLACK_DOMAIN_INITIAL_PASSWORD',
  ];
  for (const name of preparedKeys) {
    requireValue(name, `${name} is required when LAB_AWS_BLACK_DOMAIN_PREPARED=true`);
  }
  for (const name of [
    'LAB_AWS_BLACK_DOMAIN_DC_INSTANCE_ID',
    'LAB_AWS_BLACK_DOMAIN_WORKSTATION_INSTANCE_ID',
    'LAB_AWS_BLACK_DOMAIN_OPERATOR_INSTANCE_ID',
  ]) {
    requirePattern(name, /^i-[0-9a-f]{8,17}$/i, `${name} must be an EC2 instance id`);
  }
  for (const name of [
    'LAB_AWS_BLACK_DOMAIN_DC_SNAPSHOT_ID',
    'LAB_AWS_BLACK_DOMAIN_WORKSTATION_SNAPSHOT_ID',
    'LAB_AWS_BLACK_DOMAIN_OPERATOR_SNAPSHOT_ID',
  ]) {
    requirePattern(name, /^snap-[0-9a-f]{8,17}$/i, `${name} must be an EBS snapshot id`);
  }
} else if (labsEnabled) {
  warnings.push('Prepared Black Domain is disabled; Black Domain launches will fail closed instead of creating disposable fallback instances');
}

const resendKey = value('RESEND_API_KEY');
const emailFrom = value('EMAIL_FROM');
const appUrl = value('OXSIG_APP_URL');
const emailPartiallyConfigured = Boolean(resendKey || emailFrom);

if (emailPartiallyConfigured) {
  requireValue('RESEND_API_KEY', 'RESEND_API_KEY is required when transactional email is configured');
  requireValue('EMAIL_FROM', 'EMAIL_FROM is required when transactional email is configured');
  requireValue('OXSIG_APP_URL', 'OXSIG_APP_URL is required when transactional email is configured');
} else {
  warnings.push('Transactional email is not configured; external collaboration invitations cannot be delivered automatically');
}

validateHttpUrl('OXSIG_APP_URL');

const ablyKey = value('ABLY_API_KEY');
if (!ablyKey) {
  warnings.push('ABLY_API_KEY is not configured; collaboration will fall back to periodic polling instead of realtime delivery');
} else if (!ablyKey.includes(':') || !ablyKey.includes('.')) {
  errors.push('ABLY_API_KEY does not look like a valid Ably API key');
}

const sentryServerDsn = value('SENTRY_DSN');
const sentryBrowserDsn = value('NEXT_PUBLIC_SENTRY_DSN');
for (const name of ['SENTRY_DSN', 'NEXT_PUBLIC_SENTRY_DSN']) {
  const raw = value(name);
  if (!raw) continue;
  try {
    const dsn = new URL(raw);
    const projectId = dsn.pathname.split('/').pop();
    if (!['http:', 'https:'].includes(dsn.protocol) || !dsn.hostname ||
        !dsn.username || !/^\d+$/.test(projectId || '') || dsn.search || dsn.hash) {
      throw new Error('Invalid DSN');
    }
  } catch {
    // Never print the configured value: DSNs may contain credentials.
    errors.push(`${name} must be a Sentry DSN with a public key and numeric project ID, not a homepage URL`);
  }
}

if (!sentryServerDsn && !sentryBrowserDsn) {
  warnings.push('Sentry is not configured; application errors will not be sent to centralized monitoring');
} else {
  if (!sentryServerDsn) {
    warnings.push('SENTRY_DSN is not configured; custom server and terminal-bridge errors will not be sent to Sentry');
  }
  if (!sentryBrowserDsn) {
    warnings.push('NEXT_PUBLIC_SENTRY_DSN is not configured; browser errors will not be sent to Sentry');
  }
}

const sentrySourceMapValues = ['SENTRY_AUTH_TOKEN', 'SENTRY_ORG', 'SENTRY_PROJECT'];
const sentrySourceMapCount = sentrySourceMapValues.filter((name) => value(name)).length;
if (sentrySourceMapCount > 0 && sentrySourceMapCount < sentrySourceMapValues.length) {
  errors.push('SENTRY_AUTH_TOKEN, SENTRY_ORG and SENTRY_PROJECT must all be configured together for source-map uploads');
}

const posthogToken = value('POSTHOG_PROJECT_TOKEN');
const posthogHost = value('POSTHOG_HOST');
if (!posthogToken && !posthogHost) {
  warnings.push('PostHog is not configured; explicit product analytics events will not be collected');
} else {
  requireValue('POSTHOG_PROJECT_TOKEN', 'POSTHOG_PROJECT_TOKEN is required when PostHog analytics is configured');
  requireValue('POSTHOG_HOST', 'POSTHOG_HOST is required when PostHog analytics is configured');
  validateHttpUrl('POSTHOG_HOST');
  if (posthogToken && !posthogToken.startsWith('ph_')) {
    warnings.push('POSTHOG_PROJECT_TOKEN does not use the usual ph_ PostHog project-token prefix');
  }
}

if (!value('OPENAI_API_KEY')) {
  warnings.push('OPENAI_API_KEY is not configured; AI Practitioner and Academy AI features will be unavailable');
}

const elevenLabsKey = value('ELEVENLABS_API_KEY');
const elevenLabsVoiceId = value('ELEVENLABS_VOICE_ID');
if (!elevenLabsKey && !elevenLabsVoiceId) {
  warnings.push('ElevenLabs is not configured; Academy and Cyber Lab spoken narration will be unavailable');
} else {
  requireValue('ELEVENLABS_API_KEY', 'ELEVENLABS_API_KEY is required when ElevenLabs voice is configured');
  requireValue('ELEVENLABS_VOICE_ID', 'ELEVENLABS_VOICE_ID is required when ElevenLabs voice is configured');
}

if (value('AWS_PROFILE')) {
  warnings.push('AWS_PROFILE is set; production deployments should prefer an attached IAM/OIDC role');
}

if (errors.length) {
  console.error('[oxsig] Production configuration check failed:');
  for (const error of errors) console.error(`  - ${error}`);
}

if (warnings.length) {
  console.warn('[oxsig] Production configuration warnings:');
  for (const warning of warnings) console.warn(`  - ${warning}`);
}

if (errors.length) process.exit(1);
console.log(`[oxsig] Production configuration contract passed${warnings.length ? ` with ${warnings.length} warning(s)` : ''}.`);
