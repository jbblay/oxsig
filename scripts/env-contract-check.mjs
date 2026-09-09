#!/usr/bin/env node
import { readdir, readFile } from 'node:fs/promises';
import { extname, join, relative, resolve } from 'node:path';
import process from 'node:process';
import {
  LOCAL_ONLY_KEYS,
  PRODUCTION_REPLACE_KEYS,
  parseEnvExample,
} from './env-reconcile-lib.mjs';

const ROOT = resolve(process.cwd());
const EXCLUDED_DIRS = new Set(['.git', '.next', 'node_modules', 'coverage', 'dist', 'out']);
const SOURCE_EXTENSIONS = new Set(['.js', '.jsx', '.mjs', '.cjs', '.ts', '.tsx']);
const PLATFORM_MANAGED_KEYS = new Set([
  'NODE_ENV',
  'PORT',
  'HOST',
  'HOSTNAME',
  'CI',
  'VERCEL',
  'VERCEL_ENV',
  'VERCEL_URL',
  'AWS_REGION',
  'AWS_DEFAULT_REGION',
]);

function isTestFile(path) {
  return /(?:^|\/)[^/]+\.(?:test|spec)\.[^.]+$/.test(path.replaceAll('\\', '/'));
}

async function sourceFiles(directory) {
  const files = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (!EXCLUDED_DIRS.has(entry.name)) files.push(...(await sourceFiles(join(directory, entry.name))));
      continue;
    }
    const path = join(directory, entry.name);
    if (SOURCE_EXTENSIONS.has(extname(entry.name)) && !isTestFile(relative(ROOT, path))) files.push(path);
  }
  return files;
}

function referencedKeys(content) {
  const keys = new Set();
  const patterns = [
    /process\.env\.([A-Za-z_][A-Za-z0-9_]*)/g,
    /process\.env\[\s*['"]([A-Za-z_][A-Za-z0-9_]*)['"]\s*\]/g,
  ];
  for (const pattern of patterns) {
    for (const match of content.matchAll(pattern)) keys.add(match[1]);
  }
  return keys;
}

try {
  const exampleContent = await readFile(join(ROOT, '.env.example'), 'utf8');
  const contractEntries = parseEnvExample(exampleContent);
  const contractKeys = new Set(contractEntries.map((entry) => entry.key));
  const references = new Map();

  for (const file of await sourceFiles(ROOT)) {
    const content = await readFile(file, 'utf8');
    for (const key of referencedKeys(content)) {
      if (!references.has(key)) references.set(key, []);
      references.get(key).push(relative(ROOT, file).replaceAll('\\', '/'));
    }
  }

  const missing = [...references.keys()]
    .filter((key) => !PLATFORM_MANAGED_KEYS.has(key) && !contractKeys.has(key))
    .sort();
  const stalePolicyKeys = [...new Set([...LOCAL_ONLY_KEYS, ...PRODUCTION_REPLACE_KEYS])]
    .filter((key) => !contractKeys.has(key))
    .sort();

  if (missing.length) {
    console.error('[oxsig] .env.example is missing environment variables referenced by application source:');
    for (const key of missing) {
      console.error(`  - ${key}: ${references.get(key).join(', ')}`);
    }
  }

  if (stalePolicyKeys.length) {
    console.error('[oxsig] Environment reconciliation policy references keys absent from .env.example:');
    for (const key of stalePolicyKeys) console.error(`  - ${key}`);
  }

  if (missing.length || stalePolicyKeys.length) process.exit(1);

  console.log(
    `[oxsig] Environment contract passed: ${contractKeys.size} documented key(s), ${references.size} source-referenced key(s).`
  );
} catch (error) {
  console.error(`[oxsig] Environment contract audit failed: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
}
