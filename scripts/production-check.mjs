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
