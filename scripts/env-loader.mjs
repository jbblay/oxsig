import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

function parseEnvValue(raw) {
  const value = raw.trim();
  if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
    return value.slice(1, -1);
  }
  const hash = value.indexOf(' #');
  return hash >= 0 ? value.slice(0, hash).trim() : value;
}

async function loadEnvFile(path, originalEnv, { overrideLoaded = false } = {}) {
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

export async function loadOxsigEnvFiles({ cwd = process.cwd() } = {}) {
  const originalEnv = new Set(Object.keys(process.env));
  await loadEnvFile(resolve(cwd, '.env'), originalEnv);
  await loadEnvFile(resolve(cwd, '.env.local'), originalEnv, { overrideLoaded: true });
}
