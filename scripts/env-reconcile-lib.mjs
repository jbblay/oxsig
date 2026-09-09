import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

export const LOCAL_ONLY_KEYS = new Set(['AWS_PROFILE']);

// These values must be chosen explicitly for production. Reusing a local value
// automatically can silently point production at development identity, data, or
// shared secrets.
export const PRODUCTION_REPLACE_KEYS = new Set([
  'NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY',
  'CLERK_SECRET_KEY',
  'CLERK_WEBHOOK_SIGNING_SECRET',
  'DATABASE_URL',
  'OXSIG_APP_URL',
  'CRON_SECRET',
  'OXSIG_TERMINAL_BRIDGE_SECRET',
]);

export const LOCAL_REQUIRED_KEYS = [
  'NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY',
  'CLERK_SECRET_KEY',
  'DATABASE_URL',
];

export const PRODUCTION_REQUIRED_KEYS = [
  'NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY',
  'CLERK_SECRET_KEY',
  'DATABASE_URL',
  'CRON_SECRET',
  'STORAGE_BUCKET',
  'STORAGE_REGION',
  'OXSIG_TERMINAL_BRIDGE_SECRET',
];

export const LAB_REQUIRED_KEYS = [
  'LAB_AWS_REGION',
  'LAB_AWS_SUBNET_ID',
  'LAB_AWS_SECURITY_GROUP_ID',
  'LAB_AWS_OPERATION_SECURITY_GROUP_ID',
  'LAB_AWS_INSTANCE_PROFILE',
];

function assignment(line, { includeCommented = false } = {}) {
  const pattern = includeCommented
    ? /^\s*(?:#\s*)?(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/
    : /^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/;
  const match = line.match(pattern);
  if (!match) return null;
  return { key: match[1], rawValue: match[2] };
}

function parsedValue(rawValue = '') {
  const value = String(rawValue).trim();
  if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
    return value.slice(1, -1);
  }
  const hash = value.indexOf(' #');
  return hash >= 0 ? value.slice(0, hash).trim() : value;
}

export function parseEnvExample(content) {
  const entries = [];
  const seen = new Set();
  for (const line of content.split(/\r?\n/)) {
    const item = assignment(line, { includeCommented: true });
    if (!item || seen.has(item.key)) continue;
    seen.add(item.key);
    entries.push({ ...item, defaultValue: parsedValue(item.rawValue) });
  }
  return entries;
}

export function parseEnvFile(content = '') {
  const values = new Map();
  for (const line of content.split(/\r?\n/)) {
    const item = assignment(line);
    if (!item || values.has(item.key)) continue;
    values.set(item.key, {
      rawValue: item.rawValue,
      value: parsedValue(item.rawValue),
    });
  }
  return values;
}

function isConfigured(values, key) {
  return Boolean(values.get(key)?.value?.trim());
}

function appendBlock(content, lines) {
  if (!lines.length) return content;
  const base = content.endsWith('\n') || content.length === 0 ? content : `${content}\n`;
  const spacer = base.length > 0 && !base.endsWith('\n\n') ? '\n' : '';
  return `${base}${spacer}${lines.join('\n')}\n`;
}

function localAssignment(entry) {
  return `${entry.key}=${entry.rawValue}`;
}

function productionAssignment(entry, localValues) {
  if (PRODUCTION_REPLACE_KEYS.has(entry.key)) {
    return [
      '# Production-specific: local value intentionally not copied.',
      `${entry.key}=`,
    ];
  }

  const local = localValues.get(entry.key);
  if (local?.value?.trim()) {
    return [
      '# Copied from .env.local; verify this value is appropriate for production before Vercel import.',
      `${entry.key}=${local.rawValue}`,
    ];
  }

  return [`${entry.key}=${entry.rawValue}`];
}

export function reconcileContents({ exampleContent, localContent = '', productionContent = '' }) {
  const contract = parseEnvExample(exampleContent);
  const localBefore = parseEnvFile(localContent);
  const productionBefore = parseEnvFile(productionContent);

  const missingLocal = contract.filter((entry) => !localBefore.has(entry.key));
  const localLines = missingLocal.length
    ? [
        '# Added by `pnpm env:reconcile` from .env.example. Existing values above are never overwritten.',
        ...missingLocal.map(localAssignment),
      ]
    : [];
  const nextLocalContent = appendBlock(localContent, localLines);
  const localAfter = parseEnvFile(nextLocalContent);

  const missingProduction = contract.filter(
    (entry) => !LOCAL_ONLY_KEYS.has(entry.key) && !productionBefore.has(entry.key)
  );
  const productionLines = [];
  if (missingProduction.length) {
    productionLines.push(
      '# Added by `pnpm env:reconcile` from .env.example. Existing production values above are never overwritten.'
    );
    for (const entry of missingProduction) {
      productionLines.push(...productionAssignment(entry, localAfter));
    }
  }
  const nextProductionContent = appendBlock(productionContent, productionLines);
  const productionAfter = parseEnvFile(nextProductionContent);

  const localOnlyInProduction = [...LOCAL_ONLY_KEYS].filter((key) => productionAfter.has(key));
  const missingLocalValues = contract
    .filter((entry) => !isConfigured(localAfter, entry.key))
    .map((entry) => entry.key);
  const missingProductionValues = contract
    .filter((entry) => !LOCAL_ONLY_KEYS.has(entry.key) && !isConfigured(productionAfter, entry.key))
    .map((entry) => entry.key);

  return {
    contract,
    nextLocalContent,
    nextProductionContent,
    addedLocalKeys: missingLocal.map((entry) => entry.key),
    addedProductionKeys: missingProduction.map((entry) => entry.key),
    missingLocalValues,
    missingProductionValues,
    localOnlyInProduction,
    localValues: localAfter,
    productionValues: productionAfter,
  };
}

export function validateEnvironment(values, { production = false } = {}) {
  const required = production ? PRODUCTION_REQUIRED_KEYS : LOCAL_REQUIRED_KEYS;
  const errors = required.filter((key) => !isConfigured(values, key));
  const labsEnabled = values.get('LAB_AWS_ENABLED')?.value?.trim().toLowerCase() === 'true';
  if (labsEnabled) {
    for (const key of LAB_REQUIRED_KEYS) {
      if (!isConfigured(values, key) && !errors.includes(key)) errors.push(key);
    }
  }
  return { errors, labsEnabled };
}

async function readOptional(path) {
  try {
    return await readFile(path, 'utf8');
  } catch (error) {
    if (error?.code === 'ENOENT') return '';
    throw error;
  }
}

export async function reconcileEnvFiles({ cwd = process.cwd(), write = true } = {}) {
  const examplePath = resolve(cwd, '.env.example');
  const localPath = resolve(cwd, '.env.local');
  const productionPath = resolve(cwd, '.env.production');

  const exampleContent = await readFile(examplePath, 'utf8');
  const localContent = await readOptional(localPath);
  const productionContent = await readOptional(productionPath);
  const result = reconcileContents({ exampleContent, localContent, productionContent });

  if (write) {
    if (result.nextLocalContent !== localContent) await writeFile(localPath, result.nextLocalContent, 'utf8');
    if (result.nextProductionContent !== productionContent) {
      await writeFile(productionPath, result.nextProductionContent, 'utf8');
    }
  }

  return result;
}
