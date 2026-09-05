import process from 'node:process';

const errors = [];
const warnings = [];

function value(name) {
  return String(process.env[name] || '').trim();
}

function requireValue(name, message = `${name} is required`) {
  if (!value(name)) errors.push(message);
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
positiveNumber('LAB_AWS_TTL_MINUTES', { min: 5, max: 1440 });

const labsEnabled = value('LAB_AWS_ENABLED').toLowerCase() === 'true';
if (labsEnabled) {
  requireValue('LAB_AWS_REGION', 'LAB_AWS_REGION is required when LAB_AWS_ENABLED=true');
  requireValue('LAB_AWS_SUBNET_ID', 'LAB_AWS_SUBNET_ID is required when LAB_AWS_ENABLED=true');
  requireValue('LAB_AWS_SECURITY_GROUP_ID', 'LAB_AWS_SECURITY_GROUP_ID is required when LAB_AWS_ENABLED=true');
  requireValue('LAB_AWS_INSTANCE_PROFILE', 'LAB_AWS_INSTANCE_PROFILE is required when LAB_AWS_ENABLED=true');
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
validateHttpUrl('SENTRY_DSN');
validateHttpUrl('NEXT_PUBLIC_SENTRY_DSN');

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

const posthogToken = value('NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN');
const posthogHost = value('NEXT_PUBLIC_POSTHOG_HOST');
if (!posthogToken && !posthogHost) {
  warnings.push('PostHog is not configured; product analytics events will not be collected');
} else {
  requireValue('NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN', 'NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN is required when PostHog analytics is configured');
  requireValue('NEXT_PUBLIC_POSTHOG_HOST', 'NEXT_PUBLIC_POSTHOG_HOST is required when PostHog analytics is configured');
  validateHttpUrl('NEXT_PUBLIC_POSTHOG_HOST');
  if (posthogToken && !posthogToken.startsWith('ph_')) {
    warnings.push('NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN does not use the usual ph_ PostHog project-token prefix');
  }
}

if (!value('OPENAI_API_KEY')) {
  warnings.push('OPENAI_API_KEY is not configured; AI Practitioner and Academy AI features will be unavailable');
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
